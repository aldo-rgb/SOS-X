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

const with4x6Format = (url: string): string => {
    if (!url) return url;
    if (/([?&])format=/.test(url)) return url;
    return `${url}${url.includes('?') ? '&' : '?'}format=4x6`;
};

export default function RelabelingModulePage() {
    const [tracking, setTracking] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [shipment, setShipment] = useState<ShipmentData | null>(null);
    const [generatingPqtx, setGeneratingPqtx] = useState(false);
    const [pqtxMsg, setPqtxMsg] = useState<string | null>(null);

    const handleGeneratePqtxLabel = async () => {
        if (!shipment) return;
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
        const trackingQr = `https://app.entregax.com/track/${tn}`;
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
    <div class="tn">${tn}</div>
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
      JsBarcode('#barcode', ${JSON.stringify(tn)}, { format: 'CODE128', width: 2, height: 50, displayValue: false, margin: 0 });
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
  .dest-banner { display: flex; align-items: center; justify-content: center; gap: 8px; border: 3px solid #000; padding: 6px 8px; margin: 4px 0; background: #FFF3E0; }
  .dest-banner .code { font-size: 44px; font-weight: 900; color: #C1272D; line-height: 1; font-family: 'Arial Black', sans-serif; letter-spacing: 2px; }
  .dest-banner .meta { text-align: left; }
  .dest-banner .meta .lbl { font-size: 9px; color: #666; font-weight: 700; letter-spacing: 1px; }
  .dest-banner .meta .city { font-size: 12px; font-weight: 700; color: #222; }
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

    const assignedCarrier = getAssignedCarrier(shipment);
    const hasAssignedCarrier = Boolean(assignedCarrier);
    const isPaqueteExpressAssigned = Boolean(assignedCarrier && isPaqueteExpressCarrier(assignedCarrier.normalized));
    const carrierGuideTitle = assignedCarrier ? `Guía ${assignedCarrier.displayName}` : 'Guía de paquetería';

    const getAssignedCarrierGuideUrl = (opts?: { format4x6?: boolean }): string | null => {
        if (!shipment) return null;
        const baseUrl = (api.defaults.baseURL || '').replace(/\/$/, '');
        const raw = String(shipment.master.nationalLabelUrl || '').trim();

        const maybeFormat = (url: string) => (opts?.format4x6 ? with4x6Format(url) : url);

        if (raw) {
            if (/^https?:\/\//i.test(raw)) return maybeFormat(raw);
            if (raw.startsWith('/')) return maybeFormat(`${baseUrl}${raw}`);
            return maybeFormat(`${baseUrl}/${raw}`);
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
                                    <Button
                                        fullWidth
                                        variant="contained"
                                        startIcon={<PrintIcon />}
                                        onClick={() => handlePrintLabel(label)}
                                        sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#C1272D' } }}
                                    >
                                        Imprimir
                                    </Button>
                                </Paper>
                            </Grid>
                        ))}

                        {hasAssignedCarrier && (
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
                                            {isPaqueteExpressAssigned ? (
                                                <Box sx={{ display: 'grid', gap: 1 }}>
                                                    <Button
                                                        fullWidth
                                                        variant="contained"
                                                        startIcon={<PrintIcon />}
                                                        onClick={() => handlePrintAssignedCarrierGuide({ format4x6: true })}
                                                        sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#0d47a1' } }}
                                                    >
                                                        Imprimir Etiqueta
                                                    </Button>
                                                    <Button
                                                        fullWidth
                                                        variant="outlined"
                                                        startIcon={<PrintIcon />}
                                                        onClick={() => handlePrintAssignedCarrierGuide()}
                                                        sx={{ borderColor: '#1976d2', color: '#1976d2', '&:hover': { borderColor: '#0d47a1', color: '#0d47a1' } }}
                                                    >
                                                        Imprimir guía
                                                    </Button>
                                                </Box>
                                            ) : (
                                                <Button
                                                    fullWidth
                                                    variant="contained"
                                                    startIcon={<PrintIcon />}
                                                    onClick={() => handlePrintAssignedCarrierGuide()}
                                                    sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#0d47a1' } }}
                                                >
                                                    Imprimir guía asignada
                                                </Button>
                                            )}
                                        </>
                                    ) : isPaqueteExpressAssigned ? (
                                        <>
                                            <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
                                                {shipment.labels.filter(l => !l.isMaster).length > 1
                                                    ? `Aún no generadas. Se crearán ${shipment.labels.filter(l => !l.isMaster).length} guías (una por bulto) con la API de Paquete Express.`
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
                                                    : shipment.labels.filter(l => !l.isMaster).length > 1
                                                        ? `Generar ${shipment.labels.filter(l => !l.isMaster).length} guías PQTX`
                                                        : 'Generar guía PQTX'}
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
                                                Esta paquetería aún no tiene guía nacional disponible para impresión.
                                            </Typography>
                                            <Box sx={{ flex: 1 }} />
                                            <Button
                                                fullWidth
                                                variant="contained"
                                                startIcon={<PrintIcon />}
                                                disabled
                                                sx={{ bgcolor: '#90A4AE', '&.Mui-disabled': { bgcolor: '#B0BEC5', color: '#ECEFF1' } }}
                                            >
                                                Guía no disponible
                                            </Button>
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

                        {shipment.master.assignedAddress && !hasAssignedCarrier && (
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
        </Box>
    );
}
