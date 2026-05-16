// ============================================
// ENVIAR TDI EXPRESS
// Da salida a las cajas TDI Express listas para salir de China.
// Réplica del módulo "Salida" de PO Box (wizard de escaneo).
// REGLA: solo las cajas con instrucciones de envío pueden despacharse.
// ============================================
import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Button,
  CircularProgress,
  IconButton,
  Tooltip,
  Dialog,
  DialogContent,
  DialogActions,
  TextField,
  Snackbar,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Card,
  CardContent,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import RefreshIcon from '@mui/icons-material/Refresh';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import BlockIcon from '@mui/icons-material/Block';
import InboxIcon from '@mui/icons-material/Inbox';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const ORANGE = '#FF6B35';

interface Props {
  onBack: () => void;
}

interface TdiBox {
  id: number;
  tracking_internal: string;
  tracking_provider: string | null;
  box_id: string | null;
  master_id: number | null;
  master_tracking: string | null;
  box_number: number | null;
  weight: number | null;
  air_chargeable_weight: number | null;
  pkg_length: number | null;
  pkg_width: number | null;
  pkg_height: number | null;
  air_tariff_type: string | null;
  description: string | null;
  client_name: string | null;
  has_instructions: boolean;
  delivery_alias: string | null;
  delivery_address: string | null;
  delivery_city: string | null;
}

interface ScannedBox {
  id: number;
  tracking: string;
  boxId: string;
  weight: number;
  clientName: string;
}

export default function TdiExpressOutboundPage({ onBack }: Props) {
  const [boxes, setBoxes] = useState<TdiBox[]>([]);
  const [loading, setLoading] = useState(true);

  // Wizard de salida
  const [wizardOpen, setWizardOpen] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [scannedBoxes, setScannedBoxes] = useState<ScannedBox[]>([]);
  const [processing, setProcessing] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const scannedIdsRef = useRef<Set<number>>(new Set());

  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, message: '', severity: 'success' });

  // Web Audio API para sonidos de confirmación/error
  const audioCtxRef = useRef<AudioContext | null>(null);
  const getAudioCtx = () => {
    if (!audioCtxRef.current) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AC) audioCtxRef.current = new AC();
    }
    return audioCtxRef.current;
  };
  const playTone = (freq: number, duration = 0.15, type: OscillatorType = 'sine', when = 0, volume = 0.3) => {
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + when);
    gain.gain.setValueAtTime(0, ctx.currentTime + when);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + when + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + when);
    osc.stop(ctx.currentTime + when + duration);
  };
  const playSound = (kind: 'success' | 'error' | 'warning') => {
    try {
      if (kind === 'success') {
        playTone(880, 0.12, 'sine', 0, 0.35);
        playTone(1320, 0.15, 'sine', 0.1, 0.35);
      } else if (kind === 'error') {
        playTone(220, 0.18, 'square', 0, 0.25);
        playTone(160, 0.25, 'square', 0.18, 0.25);
      } else {
        playTone(600, 0.2, 'triangle', 0, 0.3);
      }
      if ('vibrate' in navigator) {
        navigator.vibrate(kind === 'success' ? 60 : kind === 'warning' ? [50, 50, 50] : [120, 80, 120]);
      }
    } catch (e) { /* ignore */ }
  };
  const notify = (message: string, severity: 'success' | 'error' | 'warning' | 'info') => {
    setSnackbar({ open: true, message, severity });
    if (severity === 'success' || severity === 'error' || severity === 'warning') {
      playSound(severity);
    }
  };

  useEffect(() => {
    loadBoxes();
  }, []);

  const loadBoxes = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/tdi-express/outbound/ready`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBoxes(res.data.boxes || []);
    } catch (error) {
      console.error('Error al cargar cajas TDI Express:', error);
    } finally {
      setLoading(false);
    }
  };

  const openWizard = () => {
    setWizardOpen(true);
    setScannedBoxes([]);
    scannedIdsRef.current.clear();
    setScanInput('');
    setTimeout(() => scanInputRef.current?.focus(), 100);
  };

  const closeWizard = () => {
    setWizardOpen(false);
    setScannedBoxes([]);
    scannedIdsRef.current.clear();
    setScanInput('');
  };

  // Manejar escaneo de guía TDX-
  const handleScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !scanInput.trim()) return;

    let raw = scanInput.trim();
    // Si viene una URL del QR, extraer el último segmento
    const urlMatch = raw.match(/(?:\/track\/|\/t\/)([A-Za-z0-9-]+)/i);
    if (urlMatch && urlMatch[1]) {
      raw = urlMatch[1];
    } else if (/^https?:\/\//i.test(raw)) {
      const parts = raw.split(/[/?#]/).filter(Boolean);
      raw = parts[parts.length - 1] || raw;
    }
    // Normalizar apóstrofes/comillas a guiones (layout US de algunos lectores)
    if (/['`´"]/.test(raw)) {
      raw = raw.replace(/[’‘'`´"]/g, '-');
    }
    let tracking = raw.toUpperCase();
    // Insertar guión si el escáner lo omitió (TDX1234567890 → TDX-1234567890)
    const noDash = tracking.match(/^(TDX)(\d{6,})$/);
    if (noDash) tracking = `${noDash[1]}-${noDash[2]}`;

    const stripDash = (s?: string | null) => (s || '').toUpperCase().replace(/-/g, '');
    const trackingNoDash = stripDash(tracking);
    const box = boxes.find(
      (b) =>
        b.tracking_internal?.toUpperCase() === tracking ||
        b.tracking_provider?.toUpperCase() === tracking ||
        stripDash(b.tracking_internal) === trackingNoDash ||
        stripDash(b.tracking_provider) === trackingNoDash
    );

    if (!box) {
      notify(`❌ Guía ${tracking} no encontrada o no está lista para salida`, 'error');
      setScanInput('');
      scanInputRef.current?.focus();
      return;
    }
    if (scannedIdsRef.current.has(box.id)) {
      notify(`⚠️ La caja ${box.tracking_internal} ya fue escaneada`, 'warning');
      setScanInput('');
      scanInputRef.current?.focus();
      return;
    }
    // REGLA DE SALIDA: la caja debe tener instrucciones de envío
    if (!box.has_instructions) {
      notify(
        `🚫 La caja ${box.tracking_internal} NO tiene instrucciones de envío — no se puede dar salida`,
        'error'
      );
      setScanInput('');
      scanInputRef.current?.focus();
      return;
    }

    scannedIdsRef.current.add(box.id);
    setScannedBoxes((prev) => [
      ...prev,
      {
        id: box.id,
        tracking: box.tracking_internal,
        boxId: box.box_id || '—',
        weight: Number(box.air_chargeable_weight || box.weight || 0),
        clientName: box.client_name || '—',
      },
    ]);
    notify(`✅ Caja ${box.tracking_internal} agregada`, 'success');
    setScanInput('');
    scanInputRef.current?.focus();
  };

  const removeScannedBox = (id: number) => {
    scannedIdsRef.current.delete(id);
    setScannedBoxes((prev) => prev.filter((b) => b.id !== id));
  };

  const handleDispatch = async () => {
    if (scannedBoxes.length === 0) {
      notify('Escanea al menos una caja', 'warning');
      return;
    }
    setProcessing(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API_URL}/api/tdi-express/outbound/dispatch`,
        { packageIds: scannedBoxes.map((b) => b.id) },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      notify(`✅ Salida confirmada — ${res.data.dispatched} caja(s) en tránsito`, 'success');
      closeWizard();
      loadBoxes();
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { error?: string } } };
      notify(axiosError.response?.data?.error || 'Error al dar salida', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const totalScannedWeight = scannedBoxes.reduce((s, b) => s + (b.weight || 0), 0);
  const readyCount = boxes.filter((b) => b.has_instructions).length;
  const blockedCount = boxes.filter((b) => !b.has_instructions).length;

  const fmtDims = (b: TdiBox) =>
    b.pkg_length && b.pkg_width && b.pkg_height
      ? `${b.pkg_length}×${b.pkg_width}×${b.pkg_height}`
      : '—';

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Paper sx={{ p: 3, mb: 3, background: 'linear-gradient(135deg, #1A1A1A 0%, #2E7D32 100%)', color: '#FFF' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <IconButton onClick={onBack} sx={{ color: '#FFF' }}>
              <ArrowBackIcon />
            </IconButton>
            <FlightTakeoffIcon sx={{ fontSize: 40, color: ORANGE }} />
            <Box>
              <Typography variant="overline" sx={{ color: ORANGE, fontWeight: 700, letterSpacing: 2 }}>
                TDI EXPRESS
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                Enviar TDI Express
              </Typography>
              <Typography variant="body2" sx={{ color: '#BDBDBD', mt: 0.5 }}>
                Da salida a las cajas listas para salir de China. Solo se despachan las que tienen instrucciones de envío.
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="Actualizar">
              <IconButton onClick={loadBoxes} sx={{ color: '#FFF' }}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Button
              variant="contained"
              startIcon={<QrCodeScannerIcon />}
              onClick={openWizard}
              sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#E55A2B' }, fontWeight: 600 }}
            >
              Nueva Salida
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, mb: 3 }}>
        <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'rgba(46, 125, 50, 0.06)', borderRadius: 2 }}>
          <Typography variant="h4" fontWeight={700} color="success.main">
            {readyCount}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Listas para salida
          </Typography>
        </Paper>
        <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'rgba(211, 47, 47, 0.06)', borderRadius: 2 }}>
          <Typography variant="h4" fontWeight={700} color="error.main">
            {blockedCount}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Sin instrucciones
          </Typography>
        </Paper>
        <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'rgba(33, 150, 243, 0.06)', borderRadius: 2 }}>
          <Typography variant="h4" fontWeight={700} color="info.main">
            {Number(boxes.reduce((s, b) => s + Number(b.air_chargeable_weight || b.weight || 0), 0)).toFixed(1)} kg
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Peso total
          </Typography>
        </Paper>
      </Box>

      {/* Tabla */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress sx={{ color: ORANGE }} />
        </Box>
      ) : (
        <TableContainer component={Paper} elevation={2} sx={{ borderRadius: 2 }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#1a1a2e' }}>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>GUÍA</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>CLIENTE</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>MEDIDAS</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>PESO</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>INSTRUCCIONES</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {boxes.map((b) => (
                <TableRow key={b.id} hover>
                  <TableCell>
                    <Typography fontWeight={600} color="primary">
                      {b.tracking_internal}
                    </Typography>
                    {b.tracking_provider && (
                      <Typography variant="caption" color="text.secondary">
                        Origen: {b.tracking_provider}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={b.box_id || '—'}
                      size="small"
                      sx={{ fontWeight: 600, bgcolor: '#f5f5f5' }}
                    />
                    {b.client_name && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        {b.client_name}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{fmtDims(b)}</TableCell>
                  <TableCell>
                    <Typography fontWeight={500}>
                      {Number(b.air_chargeable_weight || b.weight || 0).toFixed(1)} kg
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {b.has_instructions ? (
                      <Tooltip
                        title={
                          [b.delivery_alias, b.delivery_address, b.delivery_city]
                            .filter(Boolean)
                            .join(' · ') || 'Con instrucciones'
                        }
                      >
                        <Chip
                          icon={<LocationOnIcon sx={{ fontSize: 16 }} />}
                          label="Con instrucciones"
                          size="small"
                          color="success"
                          variant="outlined"
                        />
                      </Tooltip>
                    ) : (
                      <Chip
                        icon={<BlockIcon sx={{ fontSize: 16 }} />}
                        label="Sin instrucciones"
                        size="small"
                        color="error"
                        variant="outlined"
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {boxes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                    <InboxIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                    <Typography color="text.secondary">
                      No hay cajas TDI Express listas para salida
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ===== WIZARD DE SALIDA ===== */}
      <Dialog
        open={wizardOpen}
        onClose={!processing ? closeWizard : undefined}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        <Box sx={{ bgcolor: ORANGE, color: 'white', p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
          <QrCodeScannerIcon sx={{ fontSize: 32 }} />
          <Box>
            <Typography variant="h6" fontWeight={700}>
              Nueva Salida TDI Express
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              Escanea las guías de las cajas que salen de China
            </Typography>
          </Box>
        </Box>

        <DialogContent sx={{ p: 3 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            Solo se pueden despachar cajas con instrucciones de envío. Las cajas sin instrucciones serán rechazadas al escanear.
          </Alert>

          <TextField
            inputRef={scanInputRef}
            fullWidth
            placeholder="Escanear guía TDX-..."
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            onKeyDown={handleScan}
            autoFocus
            sx={{ mb: 3 }}
            InputProps={{
              startAdornment: <QrCodeScannerIcon sx={{ mr: 1, color: 'text.secondary' }} />,
              sx: { fontSize: '1.2rem' },
            }}
          />

          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <Card sx={{ flex: 1, bgcolor: '#f5f5f5' }}>
              <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                <Typography variant="h4" fontWeight={700} color="primary">
                  {scannedBoxes.length}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Cajas Escaneadas
                </Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: 1, bgcolor: '#f5f5f5' }}>
              <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                <Typography variant="h4" fontWeight={700} color="info.main">
                  {Number(totalScannedWeight).toFixed(1)} kg
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Peso Total
                </Typography>
              </CardContent>
            </Card>
          </Box>

          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Cajas en esta salida:
          </Typography>

          <Paper variant="outlined" sx={{ maxHeight: 300, overflow: 'auto' }}>
            {scannedBoxes.length === 0 ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <QrCodeScannerIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary">Escanea una guía para agregarla</Typography>
              </Box>
            ) : (
              <List dense>
                {scannedBoxes.map((b, index) => (
                  <Box key={b.id}>
                    {index > 0 && <Divider />}
                    <ListItem>
                      <ListItemText
                        primary={
                          <Typography fontWeight={600} color="primary">
                            {b.tracking}
                          </Typography>
                        }
                        secondary={
                          <Typography variant="body2" color="text.secondary">
                            {b.boxId} • {b.clientName} • {b.weight.toFixed(1)} kg
                          </Typography>
                        }
                      />
                      <ListItemSecondaryAction>
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() => removeScannedBox(b.id)}
                          sx={{ color: 'error.main' }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  </Box>
                ))}
              </List>
            )}
          </Paper>
        </DialogContent>

        <DialogActions sx={{ p: 2, bgcolor: '#f5f5f5' }}>
          <Button onClick={closeWizard} disabled={processing}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleDispatch}
            disabled={scannedBoxes.length === 0 || processing}
            startIcon={processing ? <CircularProgress size={20} color="inherit" /> : <CheckCircleIcon />}
            sx={{ bgcolor: '#2E7D32', '&:hover': { bgcolor: '#256628' }, minWidth: 180 }}
          >
            {processing ? 'Procesando...' : 'Confirmar Salida'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={snackbar.severity === 'error' ? 5000 : 2500}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ mt: { xs: 8, sm: 10 }, zIndex: (theme) => theme.zIndex.modal + 100 }}
      >
        <Alert
          severity={snackbar.severity}
          variant="filled"
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          sx={{
            minWidth: { xs: 300, sm: 520 },
            fontSize: { xs: '1rem', sm: '1.25rem' },
            fontWeight: 700,
            py: 2.5,
            px: 3,
            boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
            border: '3px solid rgba(255,255,255,0.9)',
            borderRadius: 3,
            '& .MuiAlert-icon': { fontSize: 36, mr: 1.5 },
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
