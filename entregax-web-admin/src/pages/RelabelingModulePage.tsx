// ============================================
// MÓDULO DE REETIQUETADO
// Permite buscar cualquier paquete (de cualquier servicio) por tracking
// y reimprimir su etiqueta
// ============================================

import { useState } from 'react';
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
} from '@mui/material';
import {
    Search as SearchIcon,
    Print as PrintIcon,
    QrCodeScanner as QrCodeScannerIcon,
    LocalShipping as LocalShippingIcon,
    Clear as ClearIcon,
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
    };
    children: Array<{
        id: number;
        tracking: string;
        boxNumber: number;
        weight: number;
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

export default function RelabelingModulePage() {
    const [tracking, setTracking] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [shipment, setShipment] = useState<ShipmentData | null>(null);

    const handleSearch = async () => {
        const normalized = extractTracking(tracking);
        if (!normalized) {
            setError('Ingresa un tracking válido');
            return;
        }
        setLoading(true);
        setError(null);
        setShipment(null);
        try {
            const res = await api.get(`/packages/track/${encodeURIComponent(normalized)}`);
            if (res.data?.success && res.data.shipment) {
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
    };

    const handlePrintLabel = (label: LabelData) => {
        const printWindow = window.open('', '_blank', 'width=400,height=600');
        if (!printWindow) {
            setError('Permite ventanas emergentes para imprimir');
            return;
        }

        const serviceInfo = getServiceInfo(label.tracking);
        const weightStr = label.weight ? `${Number(label.weight).toFixed(2)} kg` : '—';
        const dimsStr = label.dimensions || '—';
        const recvDate = label.receivedAt ? new Date(label.receivedAt).toLocaleDateString() : '';
        const trackingQr = `https://app.entregax.com/track/${label.tracking}`;

        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Etiqueta ${label.tracking}</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
<style>
  @page { size: 4in 6in; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 10px; padding: 0.18in; width: 4in; height: 6in; display: flex; flex-direction: column; }
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
  .qr-box #qrcode img { width: 120px !important; height: 120px !important; }
  .qr-box .qr-label { font-size: 8px; color: #666; margin-top: 2px; }
  .box-count { text-align: right; font-size: 11px; font-weight: 700; }
  .box-count .big { font-size: 20px; }
  .desc { font-size: 9px; color: #444; border: 1px dashed #999; padding: 2px 4px; margin: 2px 0; }
</style>
</head>
<body>
  <div class="header">
    <div class="service">${serviceInfo.emoji} ${serviceInfo.label}</div>
  </div>

  <div class="tracking-big">${label.tracking}</div>

  <div class="barcode-box">
    <svg id="barcode"></svg>
  </div>

  <div class="client-box">
    <div class="box-id">Box: ${label.clientBoxId}</div>
  </div>

  <div class="info-grid">
    <div><span class="label">Peso:</span> ${weightStr}</div>
    <div><span class="label">Dim:</span> ${dimsStr}</div>
    ${label.destinationCity ? `<div><span class="label">Destino:</span> ${label.destinationCity}${label.destinationCountry ? ', ' + label.destinationCountry : ''}</div>` : ''}
    ${label.carrier ? `<div><span class="label">Carrier:</span> ${label.carrier}</div>` : ''}
    ${recvDate ? `<div><span class="label">Recibido:</span> ${recvDate}</div>` : ''}
  </div>

  ${label.description ? `<div class="desc"><strong>Desc:</strong> ${label.description}</div>` : ''}

  <div class="qr-footer">
    <div class="qr-box">
      <div id="qrcode"></div>
      <div class="qr-label">QR tracking</div>
    </div>
    <div class="box-count">
      ${label.totalBoxes > 1 ? `<div>Caja</div><div class="big">${label.boxNumber} / ${label.totalBoxes}</div>` : `<div class="big">1 / 1</div>`}
    </div>
  </div>

<script>
  window.addEventListener('load', function() {
    try {
      JsBarcode('#barcode', ${JSON.stringify(label.tracking)}, {
        format: 'CODE128', width: 2, height: 60, displayValue: false, margin: 0
      });
    } catch(e) { console.error('barcode', e); }

    try {
      var qr = qrcode(0, 'M');
      qr.addData(${JSON.stringify(trackingQr)});
      qr.make();
      document.getElementById('qrcode').innerHTML = qr.createImgTag(3);
    } catch(e) { console.error('qr', e); }

    setTimeout(function() { window.print(); }, 500);
  });
</script>
</body>
</html>`;

        printWindow.document.write(html);
        printWindow.document.close();
    };

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
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
                            Módulo de Reetiquetado
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
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                        <Box>
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
                            </Box>
                        </Box>
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

                    <Divider sx={{ my: 2 }} />

                    <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
                        🏷️ Etiquetas disponibles ({shipment.labels.length})
                    </Typography>

                    <Grid container spacing={2}>
                        {shipment.labels.map((label, idx) => (
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
                                                    ? `Caja ${label.boxNumber} de ${label.totalBoxes}`
                                                    : 'Etiqueta'}
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
                                    <Button
                                        fullWidth
                                        variant="contained"
                                        startIcon={<PrintIcon />}
                                        onClick={() => handlePrintLabel(label)}
                                        sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#C1272D' } }}
                                    >
                                        Imprimir etiqueta
                                    </Button>
                                </Paper>
                            </Grid>
                        ))}
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
        </Box>
    );
}
