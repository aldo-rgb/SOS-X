/**
 * RelabelingScreen - Módulo de re-etiquetado (móvil)
 * Mirror de RelabelingModulePage.tsx con expo-print para imprimir/compartir PDF
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Modal } from 'react-native';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#111';
const GREY_BG = '#F5F5F5';

interface LabelData {
  boxNumber: number;
  totalBoxes: number;
  tracking: string;
  labelCode: string;
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
    description?: string;
    weight: number | null;
    isMaster: boolean;
    totalBoxes: number;
    statusLabel: string;
    destinationCity?: string | null;
    destinationCountry?: string | null;
    destinationCode?: string | null;
    nationalCarrier?: string | null;
    nationalTracking?: string | null;
    nationalLabelUrl?: string | null;
    assignedAddress?: {
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
  labels: LabelData[];
  children?: Array<{
    id: number;
    tracking: string;
    boxNumber: number;
    weight?: number | null;
    nationalTracking?: string | null;
    nationalLabelUrl?: string | null;
    nationalCarrier?: string | null;
  }>;
  client: { id: number; name: string; email: string; boxId: string };
}

const extractTracking = (raw: string): string => {
  const t = raw.trim();
  if (!t) return '';
  const directToken = /^[A-Za-z0-9][A-Za-z0-9\-_']{5,}$/;
  if (directToken.test(t) && !t.includes('/') && !t.includes('http')) {
    return t.replace(/[_']/g, '-').toUpperCase();
  }
  const cleanPattern = /^[A-Z]{2,}[-_'][A-Z0-9]{2,}(?:[-_'][A-Z0-9]{2,})*$/i;
  if (cleanPattern.test(t)) return t.replace(/[_']/g, '-').toUpperCase();
  const allMatches = t.match(/[A-Z]{2,}[-_'][A-Z0-9]{2,}(?:[-_'][A-Z0-9]{2,})*/gi) || [];
  const candidate = allMatches.find((m) => !/TREGAX/i.test(m));
  if (candidate) {
    let c = candidate.replace(/[_']/g, '-').toUpperCase();
    if (!c.includes('-') && c.length > 3) c = c.slice(0, 2) + '-' + c.slice(2);
    return c;
  }
  return t.toUpperCase();
};

const getServiceInfo = (tracking: string) => {
  const prefix = tracking.split('-')[0]?.toUpperCase() || '';
  const map: Record<string, { label: string; color: string; emoji: string }> = {
    US: { label: 'PO Box USA', color: '#2196F3', emoji: '🇺🇸' },
    CN: { label: 'China Aéreo', color: '#FF5722', emoji: '✈️' },
    LOG: { label: 'China Marítimo', color: '#00BCD4', emoji: '🚢' },
    AIR: { label: 'Aéreo', color: '#FF5722', emoji: '✈️' },
    DHL: { label: 'DHL Monterrey', color: '#FFC107', emoji: '📮' },
    MX: { label: 'Nacional MX', color: '#4CAF50', emoji: '🇲🇽' },
  };
  return map[prefix] || { label: prefix || 'Otro', color: '#666', emoji: '📦' };
};

const normalizeCarrierText = (value: any): string => String(value || '')
  .toLowerCase()
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const getAssignedCarrier = (shipment: ShipmentData | null): { displayName: string; normalized: string } | null => {
  if (!shipment) return null;

  const byMaster = normalizeCarrierText(shipment.master.nationalCarrier);
  if (byMaster) {
    return {
      displayName: String(shipment.master.nationalCarrier).trim(),
      normalized: byMaster,
    };
  }

  const cfg = shipment.master.assignedAddress?.carrierConfig;
  if (!cfg || typeof cfg !== 'object') return null;

  const candidates = [
    cfg.carrier,
    cfg.carrier_name,
    cfg.provider,
    cfg.provider_name,
    cfg.name,
    cfg.slug,
    cfg.code,
  ].filter(Boolean);

  if (!candidates.length) return null;
  const selected = String(candidates[0]).trim();
  return {
    displayName: selected,
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

const buildLabelHtml = (label: LabelData): string => {
  const svc = getServiceInfo(label.tracking);
  const weightStr = label.weight ? `${Number(label.weight).toFixed(2)} kg` : '—';
  const dimsStr = label.dimensions || '—';
  const recvDate = label.receivedAt ? new Date(label.receivedAt).toLocaleDateString() : '';
  const trackingQr = `https://app.entregax.com/track/${label.tracking}`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
<style>
  @page { size: 4in 6in; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 10px; padding: 0.18in; width: 4in; height: 6in; display: flex; flex-direction: column; }
  .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 6px; }
  .header .service { display: inline-block; padding: 6px 14px; border: 2px solid #000; color: #000; font-size: 16px; font-weight: 900; border-radius: 4px; }
  .tracking-big { font-size: 18px; font-weight: 900; text-align: center; margin: 4px 0; font-family: 'Courier New', monospace; }
  .barcode-box { text-align: center; margin: 4px 0; }
  .barcode-box svg { max-height: 85px; width: 100%; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 6px; font-size: 10px; margin: 4px 0; }
  .info-grid .label { font-weight: 700; color: #555; }
  .client-box { border: 2px solid #000; padding: 6px; margin: 4px 0; text-align: center; }
  .client-box .box-id { font-size: 22px; font-weight: 900; color: #C1272D; letter-spacing: 1px; }
  .qr-footer { display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 4px; border-top: 1px dashed #999; }
  .qr-box img { width: 120px !important; height: 120px !important; }
  .box-count { text-align: right; font-size: 11px; font-weight: 700; }
  .box-count .big { font-size: 20px; }
  .dest-banner { display: flex; align-items: center; justify-content: center; gap: 8px; border: 3px solid #000; padding: 6px 8px; margin: 4px 0; background: #FFF3E0; }
  .dest-banner .code { font-size: 44px; font-weight: 900; color: #C1272D; line-height: 1; font-family: 'Arial Black', sans-serif; letter-spacing: 2px; }
  .dest-banner .meta { text-align: left; }
  .dest-banner .meta .lbl { font-size: 9px; color: #666; font-weight: 700; }
  .dest-banner .meta .city { font-size: 12px; font-weight: 700; color: #222; }
</style></head><body>
  <div class="header"><div class="service">${svc.emoji} ${svc.label}</div></div>
  <div class="tracking-big">${label.tracking}</div>
  <div class="barcode-box"><svg id="barcode"></svg></div>
  <div class="client-box"><div class="box-id">Box: ${label.clientBoxId}</div></div>
  ${label.destinationCode ? `<div class="dest-banner">
    <div class="code">${label.destinationCode}</div>
    <div class="meta"><div class="lbl">DESTINO</div><div class="city">${label.destinationCity || ''}${label.destinationCountry ? ', ' + label.destinationCountry : ''}</div></div>
  </div>` : ''}
  <div class="info-grid">
    <div><span class="label">Peso:</span> ${weightStr}</div>
    <div><span class="label">Dim:</span> ${dimsStr}</div>
    ${label.carrier ? `<div><span class="label">Carrier:</span> ${label.carrier}</div>` : ''}
    ${recvDate ? `<div><span class="label">Recibido:</span> ${recvDate}</div>` : ''}
  </div>
  <div class="qr-footer">
    <div class="qr-box"><div id="qrcode"></div></div>
    <div class="box-count">
      ${label.totalBoxes > 1 ? `<div>Caja</div><div class="big">${label.boxNumber} / ${label.totalBoxes}</div>` : `<div class="big">1 / 1</div>`}
    </div>
  </div>
<script>
  window.addEventListener('load', function() {
    try { JsBarcode('#barcode', '${label.tracking}', { format: 'CODE128', width: 2, height: 60, displayValue: false, margin: 0 }); } catch(e) {}
    try {
      var qr = qrcode(0, 'M'); qr.addData('${trackingQr}'); qr.make();
      document.getElementById('qrcode').innerHTML = qr.createImgTag(3);
    } catch(e) {}
  });
</script>
</body></html>`;
};

const buildBulkLabelsHtml = (labels: LabelData[]): string => {
  const pages = labels.map((label, idx) => {
    const svc = getServiceInfo(label.tracking);
    const weightStr = label.weight ? `${Number(label.weight).toFixed(2)} kg` : '—';
    const dimsStr = label.dimensions || '—';
    const recvDate = label.receivedAt ? new Date(label.receivedAt).toLocaleDateString() : '';
    const trackingQr = `https://app.entregax.com/track/${label.tracking}`;
    const barcodeId = `barcode-${idx}`;
    const qrId = `qrcode-${idx}`;

    return `<section class="page">
      <div class="header"><div class="service">${svc.emoji} ${svc.label}</div></div>
      <div class="tracking-big">${label.tracking}</div>
      <div class="barcode-box"><svg id="${barcodeId}"></svg></div>
      <div class="client-box"><div class="box-id">Box: ${label.clientBoxId}</div></div>
      ${label.destinationCode ? `<div class="dest-banner">
        <div class="code">${label.destinationCode}</div>
        <div class="meta"><div class="lbl">DESTINO</div><div class="city">${label.destinationCity || ''}${label.destinationCountry ? ', ' + label.destinationCountry : ''}</div></div>
      </div>` : ''}
      <div class="info-grid">
        <div><span class="label">Peso:</span> ${weightStr}</div>
        <div><span class="label">Dim:</span> ${dimsStr}</div>
        ${label.carrier ? `<div><span class="label">Carrier:</span> ${label.carrier}</div>` : ''}
        ${recvDate ? `<div><span class="label">Recibido:</span> ${recvDate}</div>` : ''}
      </div>
      <div class="qr-footer">
        <div class="qr-box"><div id="${qrId}"></div></div>
        <div class="box-count">
          ${label.totalBoxes > 1 ? `<div>Caja</div><div class="big">${label.boxNumber} / ${label.totalBoxes}</div>` : `<div class="big">1 / 1</div>`}
        </div>
      </div>
      <script>
        try { JsBarcode('#${barcodeId}', '${label.tracking}', { format: 'CODE128', width: 2, height: 60, displayValue: false, margin: 0 }); } catch(e) {}
        try { var qr = qrcode(0, 'M'); qr.addData('${trackingQr}'); qr.make(); document.getElementById('${qrId}').innerHTML = qr.createImgTag(3); } catch(e) {}
      </script>
    </section>`;
  }).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
<style>
  @page { size: 4in 6in; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; }
  .page { page-break-after: always; font-size: 10px; padding: 0.18in; width: 4in; height: 6in; display: flex; flex-direction: column; }
  .page:last-child { page-break-after: auto; }
  .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 6px; }
  .header .service { display: inline-block; padding: 6px 14px; border: 2px solid #000; color: #000; font-size: 16px; font-weight: 900; border-radius: 4px; }
  .tracking-big { font-size: 18px; font-weight: 900; text-align: center; margin: 4px 0; font-family: 'Courier New', monospace; }
  .barcode-box { text-align: center; margin: 4px 0; }
  .barcode-box svg { max-height: 85px; width: 100%; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 6px; font-size: 10px; margin: 4px 0; }
  .info-grid .label { font-weight: 700; color: #555; }
  .client-box { border: 2px solid #000; padding: 6px; margin: 4px 0; text-align: center; }
  .client-box .box-id { font-size: 22px; font-weight: 900; color: #C1272D; letter-spacing: 1px; }
  .qr-footer { display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 4px; border-top: 1px dashed #999; }
  .qr-box img { width: 120px !important; height: 120px !important; }
  .box-count { text-align: right; font-size: 11px; font-weight: 700; }
  .box-count .big { font-size: 20px; }
  .dest-banner { display: flex; align-items: center; justify-content: center; gap: 8px; border: 3px solid #000; padding: 6px 8px; margin: 4px 0; background: #FFF3E0; }
  .dest-banner .code { font-size: 44px; font-weight: 900; color: #C1272D; line-height: 1; font-family: 'Arial Black', sans-serif; letter-spacing: 2px; }
  .dest-banner .meta { text-align: left; }
  .dest-banner .meta .lbl { font-size: 9px; color: #666; font-weight: 700; }
  .dest-banner .meta .city { font-size: 12px; font-weight: 700; color: #222; }
</style></head><body>${pages}</body></html>`;
};

const buildLocalDeliveryHtml = (shipment: ShipmentData): string => {
  const a = shipment.master.assignedAddress;
  const recipient = (a?.recipientName || shipment.client.name || 'CLIENTE').toUpperCase();
  const street = `${a?.street || ''} ${a?.exterior || ''}${a?.interior ? ` Int. ${a.interior}` : ''}`.trim();
  const cityLine = `${a?.city || ''}${a?.state ? ', ' + a.state : ''}`.trim();
  const colZip = `${a?.neighborhood ? 'Col. ' + a.neighborhood + ' · ' : ''}C.P. ${a?.zip || '—'}`;
  const tn = shipment.master.tracking;
  const today = new Date().toLocaleDateString('es-MX');
  const trackingQr = `https://app.entregax.com/track/${tn}`;
  const svc = getServiceInfo(tn);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
<style>
  @page { size: 4in 6in; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; padding: 0.18in; width: 4in; height: 6in; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #F05A28; padding-bottom: 6px; margin-bottom: 6px; }
  .brand .logo { font-size: 22px; font-weight: 900; color: #F05A28; }
  .brand .badge { background: #F05A28; color: #fff; padding: 4px 10px; font-size: 10px; font-weight: 800; border-radius: 4px; }
  .tracking-row { display: flex; justify-content: space-between; align-items: center; margin: 4px 0; }
  .tracking-row .tn { font-family: 'Courier New', monospace; font-size: 16px; font-weight: 900; }
  .tracking-row .date { font-size: 10px; color: #555; }
  .barcode-box { text-align: center; margin: 4px 0; }
  .barcode-box svg { max-height: 65px; width: 100%; }
  .dest { border: 2px solid #000; padding: 8px; margin: 6px 0; }
  .dest .lbl { font-size: 9px; color: #666; font-weight: 800; margin-bottom: 3px; }
  .dest .name { font-size: 14px; font-weight: 900; color: #111; margin-bottom: 4px; }
  .dest .line { font-size: 12px; color: #222; line-height: 1.3; }
  .dest .city { font-size: 14px; font-weight: 900; color: #C1272D; margin-top: 4px; }
  .dest .phone { font-size: 11px; font-weight: 700; margin-top: 4px; }
  .dest-code { border: 3px solid #C1272D; border-radius: 8px; padding: 6px; margin: 6px 0; background: #FFF3F0; text-align: center; }
  .dest-code .lbl { font-size: 9px; color: #666; font-weight: 800; }
  .dest-code .code { font-family: 'Arial Black', sans-serif; font-size: 52px; font-weight: 900; color: #C1272D; line-height: 1; }
  .pkg-info { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; font-size: 10px; margin: 4px 0; text-align: center; }
  .pkg-info .cell { border: 1px solid #ddd; padding: 4px; }
  .pkg-info .cell .lbl { font-size: 8px; color: #666; font-weight: 700; }
  .pkg-info .cell .val { font-size: 11px; font-weight: 800; }
  .footer { display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 6px; border-top: 1px dashed #999; }
  .footer .qr-box img { width: 90px !important; height: 90px !important; }
  .footer .service { text-align: right; font-size: 10px; font-weight: 800; color: #F05A28; }
</style></head><body>
  <div class="brand">
    <div class="logo">EntregaX</div>
    <div class="badge">📍 ENTREGA LOCAL</div>
  </div>
  <div class="tracking-row"><div class="tn">${tn}</div><div class="date">${today}</div></div>
  <div class="barcode-box"><svg id="barcode"></svg></div>
  <div class="dest">
    <div class="lbl">ENTREGAR A</div>
    <div class="name">${recipient}</div>
    <div class="line">${street || '—'}</div>
    <div class="line">${colZip}</div>
    <div class="city">${cityLine}</div>
    ${a?.phone ? `<div class="phone">📞 ${a.phone}</div>` : ''}
    ${a?.reference ? `<div class="line">Ref: ${a.reference}</div>` : ''}
  </div>
  <div class="dest-code"><div class="lbl">DESTINO</div><div class="code">${shipment.master.destinationCode || '—'}</div></div>
  <div class="pkg-info">
    <div class="cell"><div class="lbl">CLIENTE</div><div class="val">${shipment.client.boxId}</div></div>
    <div class="cell"><div class="lbl">PESO</div><div class="val">${shipment.master.weight ? Number(shipment.master.weight).toFixed(1) + ' kg' : '—'}</div></div>
    <div class="cell"><div class="lbl">CAJAS</div><div class="val">${shipment.master.totalBoxes || 1}</div></div>
  </div>
  <div class="footer"><div id="qrcode"></div><div class="service">${svc.emoji} ${svc.label}</div></div>
<script>
  window.addEventListener('load', function() {
    try { JsBarcode('#barcode', '${tn}', { format: 'CODE128', width: 2, height: 50, displayValue: false, margin: 0 }); } catch(e) {}
    try { var qr = qrcode(0, 'M'); qr.addData('${trackingQr}'); qr.make(); document.getElementById('qrcode').innerHTML = qr.createImgTag(3); } catch(e) {}
  });
</script>
</body></html>`;
};

export default function RelabelingScreen({ route, navigation }: any) {
  const { token } = route.params;
  const [tracking, setTracking] = useState('');
  const [loading, setLoading] = useState(false);
  const [shipment, setShipment] = useState<ShipmentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [selectedLabelKeys, setSelectedLabelKeys] = useState<string[]>([]);
  const [generatingAssignedGuide, setGeneratingAssignedGuide] = useState(false);
  const [selectedPqtx, setSelectedPqtx] = useState<string[]>([]);
  const [printingAllPqtx, setPrintingAllPqtx] = useState(false);

  const assignedCarrier = getAssignedCarrier(shipment);
  const hasAssignedCarrier = Boolean(assignedCarrier);
  const isPaqueteExpressAssigned = Boolean(assignedCarrier && isPaqueteExpressCarrier(assignedCarrier.normalized));
  const isEntregaxLocalAssigned = Boolean(assignedCarrier && isEntregaxLocalCarrier(assignedCarrier.normalized));
  const hasLocalDeliveryOption = Boolean(shipment?.master.assignedAddress) && (!hasAssignedCarrier || isEntregaxLocalAssigned);
  const hasCarrierGuideOption = hasAssignedCarrier && !isEntregaxLocalAssigned;
  const availableLabelsCount = (shipment?.labels.length || 0) + ((hasCarrierGuideOption || hasLocalDeliveryOption) ? 1 : 0);

  // Una sola guía PQTX (multipieza). Las hijas comparten el mismo national_tracking del master.
  const pqtxGuides: Array<{ tracking: string; pieces: number; childId: number | null }> = (() => {
    if (!shipment) return [];
    const totalPieces = Math.max(1, shipment.master.totalBoxes || (shipment.children || []).length || 1);
    if (shipment.master.nationalTracking) {
      return [{ tracking: shipment.master.nationalTracking, pieces: totalPieces, childId: null }];
    }
    // Fallback legacy: alguna hija con tracking
    const firstChildWithTracking = (shipment.children || []).find((c) => c.nationalTracking);
    if (firstChildWithTracking?.nationalTracking) {
      return [{ tracking: firstChildWithTracking.nationalTracking as string, pieces: totalPieces, childId: firstChildWithTracking.id }];
    }
    return [];
  })();

  const showMultiPqtx = isPaqueteExpressAssigned && pqtxGuides.length > 0;

  useEffect(() => {
    setSelectedPqtx([]);
  }, [shipment?.master?.id]);

  const buildPqtxLabelUrl = (tracking: string, opts?: { format4x6?: boolean }): string => {
    const base = `${API_URL}/api/admin/paquete-express/label/pdf/${tracking}`;
    return opts?.format4x6 ? with4x6Format(base) : base;
  };

  const togglePqtxSelection = (tracking: string) => {
    setSelectedPqtx((prev) => prev.includes(tracking) ? prev.filter((t) => t !== tracking) : [...prev, tracking]);
  };

  const toggleSelectAllPqtx = () => {
    setSelectedPqtx((prev) => prev.length === pqtxGuides.length ? [] : pqtxGuides.map((g) => g.tracking));
  };

  const printPqtxGuide = async (tracking: string, opts?: { format4x6?: boolean }) => {
    try {
      const url = buildPqtxLabelUrl(tracking, opts);
      await Print.printAsync({ uri: url });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo imprimir la guía');
    }
  };

  const printPqtxList = async (trackings: string[], opts?: { format4x6?: boolean }) => {
    if (trackings.length === 0) {
      Alert.alert('Selección requerida', 'Selecciona al menos una guía para imprimir.');
      return;
    }
    setPrintingAllPqtx(true);
    try {
      for (const t of trackings) {
        try {
          await Print.printAsync({ uri: buildPqtxLabelUrl(t, opts) });
        } catch (e: any) {
          // Continúa con la siguiente si el usuario cancela una
          if (!/cancel/i.test(e?.message || '')) throw e;
        }
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudieron imprimir todas las guías');
    } finally {
      setPrintingAllPqtx(false);
    }
  };

  const getAssignedCarrierGuideUrl = (opts?: { format4x6?: boolean }): string | null => {
    if (!shipment) return null;
    const maybeFormat = (url: string) => (opts?.format4x6 ? with4x6Format(url) : url);
    const raw = String(shipment.master.nationalLabelUrl || '').trim();
    if (raw) {
      const base = /^https?:\/\//i.test(raw)
        ? raw
        : raw.startsWith('/')
          ? `${API_URL}${raw}`
          : `${API_URL}/${raw}`;
      return maybeFormat(base);
    }
    if (isPaqueteExpressAssigned && shipment.master.nationalTracking) {
      return maybeFormat(`${API_URL}/api/admin/paquete-express/label/pdf/${shipment.master.nationalTracking}`);
    }
    return null;
  };

  const generateAssignedCarrierGuide = async (): Promise<string | null> => {
    if (!shipment) return null;
    if (!isPaqueteExpressAssigned) {
      Alert.alert('No disponible', 'No hay integración de generación automática para esta paquetería.');
      return null;
    }

    setGeneratingAssignedGuide(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/paquete-express/generate-for-package`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ packageId: shipment.master.id }),
      });

      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'No se pudo generar la guía');
      }

      const tn: string | null = data.trackingNumber || shipment.master.nationalTracking || null;
      const labelUrlRaw: string | null = data.labelUrl || (tn ? `/api/admin/paquete-express/label/pdf/${tn}` : null);
      const absoluteUrl = labelUrlRaw
        ? (/^https?:\/\//i.test(labelUrlRaw) ? labelUrlRaw : `${API_URL}${labelUrlRaw.startsWith('/') ? '' : '/'}${labelUrlRaw}`)
        : null;

      setShipment((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          master: {
            ...prev.master,
            nationalTracking: tn || prev.master.nationalTracking || null,
            nationalLabelUrl: labelUrlRaw || prev.master.nationalLabelUrl || null,
          },
        };
      });

      if (!absoluteUrl) {
        throw new Error('La guía se generó pero no se recibió URL de impresión');
      }

      return absoluteUrl ? with4x6Format(absoluteUrl) : null;
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo generar la guía asignada');
      return null;
    } finally {
      setGeneratingAssignedGuide(false);
    }
  };

  const search = async (raw?: string) => {
    const normalized = extractTracking(raw ?? tracking);
    if (!normalized) { setError('Ingresa un tracking válido'); return; }
    setLoading(true); setError(null); setShipment(null);
    try {
      const res = await fetch(`${API_URL}/api/packages/track/${encodeURIComponent(normalized)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.success && data.shipment) {
        setShipment(data.shipment);
        setTracking(normalized);
      } else {
        setError(data.error || 'Paquete no encontrado');
      }
    } catch (e: any) {
      setError(e.message || 'Error de red');
    } finally { setLoading(false); }
  };

  const printLabel = async (label: LabelData) => {
    setPrintingId(label.tracking + '-' + label.boxNumber);
    try {
      const html = buildLabelHtml(label);
      if (Sharing.isAvailableAsync && await Sharing.isAvailableAsync()) {
        const { uri } = await Print.printToFileAsync({ html, width: 288, height: 432 }); // 4x6 in points
        await Sharing.shareAsync(uri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf' });
      } else {
        await Print.printAsync({ html });
      }
    } catch (e: any) {
      Alert.alert('Error al imprimir', e.message || 'No se pudo generar la etiqueta');
    } finally { setPrintingId(null); }
  };

  const labelKey = (label: LabelData, idx: number) => `${label.tracking}-${label.boxNumber}-${idx}`;

  useEffect(() => {
    setSelectedLabelKeys([]);
  }, [shipment?.master?.id]);

  const toggleLabelSelection = (label: LabelData, idx: number) => {
    const key = labelKey(label, idx);
    setSelectedLabelKeys((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };

  const selectAllLabels = () => {
    if (!shipment) return;
    setSelectedLabelKeys(shipment.labels.map((l, idx) => labelKey(l, idx)));
  };

  const clearSelectedLabels = () => setSelectedLabelKeys([]);

  const printSelectedLabels = async () => {
    if (!shipment || selectedLabelKeys.length === 0) {
      Alert.alert('Selección requerida', 'Selecciona al menos una etiqueta para imprimir.');
      return;
    }
    const selected = shipment.labels.filter((l, idx) => selectedLabelKeys.includes(labelKey(l, idx)));
    try {
      const html = buildBulkLabelsHtml(selected);
      if (Sharing.isAvailableAsync && await Sharing.isAvailableAsync()) {
        const { uri } = await Print.printToFileAsync({ html, width: 288, height: 432 });
        await Sharing.shareAsync(uri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf' });
      } else {
        await Print.printAsync({ html });
      }
    } catch (e: any) {
      Alert.alert('Error al imprimir', e.message || 'No se pudo imprimir en masivo');
    }
  };

  const openScanner = async () => {
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) { Alert.alert('Cámara', 'Se requiere permiso de cámara'); return; }
    }
    setScanOpen(true);
  };

  const onScan = ({ data }: { data: string }) => {
    setScanOpen(false);
    setTracking(data);
    search(data);
  };

  const printAssignedCarrierGuide = async (opts?: { format4x6?: boolean }) => {
    let url = getAssignedCarrierGuideUrl(opts);
    if (!url) {
      url = await generateAssignedCarrierGuide();
      if (url && opts?.format4x6) url = with4x6Format(url);
    }
    if (!url) {
      return;
    }
    try {
      // Imprime directamente el PDF de la guía sin salir de la app
      await Print.printAsync({ uri: url });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo imprimir la guía');
    }
  };

  const printLocalDeliveryLabel = async () => {
    if (!shipment?.master.assignedAddress) {
      Alert.alert('Sin dirección', 'No hay dirección de entrega asignada.');
      return;
    }
    try {
      const html = buildLocalDeliveryHtml(shipment);
      if (Sharing.isAvailableAsync && await Sharing.isAvailableAsync()) {
        const { uri } = await Print.printToFileAsync({ html, width: 288, height: 432 });
        await Sharing.shareAsync(uri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf' });
      } else {
        await Print.printAsync({ html });
      }
    } catch (e: any) {
      Alert.alert('Error al imprimir', e.message || 'No se pudo generar la etiqueta local');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.headerLabel}>OPS · ENTREGAX</Text>
          <Text style={styles.headerTitle}>Re-etiquetado</Text>
        </View>
        <MaterialCommunityIcons name="printer" size={22} color="#fff" />
      </View>

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={styles.searchCard}>
          <Text style={styles.searchTitle}>Buscar paquete por tracking</Text>
          <View style={styles.searchRow}>
            <View style={styles.searchInputBox}>
              <Ionicons name="search" size={18} color="#999" />
              <TextInput
                style={styles.searchInput}
                placeholder="Ej: US-7358716, AIR2618-012"
                placeholderTextColor="#999"
                value={tracking}
                onChangeText={setTracking}
                autoCapitalize="characters"
                returnKeyType="search"
                onSubmitEditing={() => search()}
              />
              {tracking ? <TouchableOpacity onPress={() => { setTracking(''); setShipment(null); setError(null); }}><Ionicons name="close-circle" size={18} color="#999" /></TouchableOpacity> : null}
            </View>
            <TouchableOpacity style={styles.scanBtn} onPress={openScanner}>
              <MaterialCommunityIcons name="qrcode-scan" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.searchSubmit, !tracking && { opacity: 0.5 }]} onPress={() => search()} disabled={!tracking || loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.searchSubmitText}>Buscar</Text>}
          </TouchableOpacity>
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>

        {shipment && (
          <View>
            {/* Master info */}
            <View style={styles.shipmentCard}>
              <View style={[styles.serviceBadge, { backgroundColor: getServiceInfo(shipment.master.tracking).color }]}>
                <Text style={styles.serviceBadgeText}>{getServiceInfo(shipment.master.tracking).emoji} {getServiceInfo(shipment.master.tracking).label}</Text>
              </View>
              <Text style={styles.masterTracking}>{shipment.master.tracking}</Text>
              <Text style={styles.masterStatus}>{shipment.master.statusLabel}</Text>
              <View style={styles.divider} />
              <DetailRow label="Cliente" value={`${shipment.client.boxId} · ${shipment.client.name}`} />
              {shipment.master.description && <DetailRow label="Descripción" value={shipment.master.description} />}
              {shipment.master.weight && <DetailRow label="Peso" value={`${Number(shipment.master.weight).toFixed(2)} kg`} />}
              {shipment.master.totalBoxes > 1 && <DetailRow label="Cajas" value={String(shipment.master.totalBoxes)} />}
              {shipment.master.destinationCode && <DetailRow label="Destino" value={`${shipment.master.destinationCode} · ${shipment.master.destinationCity || ''}`} />}
              {assignedCarrier && <DetailRow label="Paquetería" value={assignedCarrier.displayName} />}
              {shipment.master.nationalTracking && <DetailRow label="Guía Nacional" value={shipment.master.nationalTracking} />}
            </View>

            <Text style={styles.sectionTitle}>Etiquetas disponibles ({availableLabelsCount})</Text>
            {!!shipment.labels.length && (
              <View style={styles.bulkActionsRow}>
                <TouchableOpacity style={styles.bulkSecondaryBtn} onPress={selectedLabelKeys.length === shipment.labels.length ? clearSelectedLabels : selectAllLabels}>
                  <Text style={styles.bulkSecondaryBtnText}>
                    {selectedLabelKeys.length === shipment.labels.length ? 'Quitar selección' : 'Seleccionar todo'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bulkPrimaryBtn, selectedLabelKeys.length === 0 && { opacity: 0.55 }]}
                  onPress={printSelectedLabels}
                  disabled={selectedLabelKeys.length === 0}
                >
                  <Ionicons name="print" size={16} color="#fff" />
                  <Text style={styles.bulkPrimaryBtnText}>Imprimir todo ({selectedLabelKeys.length})</Text>
                </TouchableOpacity>
              </View>
            )}
            {shipment.labels.map((label, idx) => {
              const svc = getServiceInfo(label.tracking);
              const printingThis = printingId === label.tracking + '-' + label.boxNumber;
              const selected = selectedLabelKeys.includes(labelKey(label, idx));
              return (
                <View key={`${label.tracking}-${idx}`} style={[styles.labelCard, selected && styles.labelCardSelected]}>
                  <View style={{ flex: 1 }}>
                    <TouchableOpacity style={styles.selectRow} onPress={() => toggleLabelSelection(label, idx)}>
                      <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={18} color={selected ? ORANGE : '#777'} />
                      <Text style={styles.selectRowText}>{selected ? 'Seleccionada' : 'Seleccionar'}</Text>
                    </TouchableOpacity>
                    <View style={[styles.smallBadge, { backgroundColor: svc.color + '20' }]}>
                      <Text style={[styles.smallBadgeText, { color: svc.color }]}>{svc.emoji} {svc.label}</Text>
                    </View>
                    <Text style={styles.labelTracking}>{label.tracking}</Text>
                    <Text style={styles.labelMeta}>
                      {label.totalBoxes > 1 ? `Caja ${label.boxNumber}/${label.totalBoxes} · ` : ''}
                      {label.weight ? `${Number(label.weight).toFixed(2)} kg` : ''}
                      {label.isMaster ? ' · MASTER' : ''}
                    </Text>
                    {label.destinationCode && <Text style={styles.labelDest}>📍 {label.destinationCode} {label.destinationCity ? `· ${label.destinationCity}` : ''}</Text>}
                  </View>
                  <TouchableOpacity style={[styles.printBtn, printingThis && { opacity: 0.6 }]} onPress={() => printLabel(label)} disabled={printingThis}>
                    {printingThis ? <ActivityIndicator color="#fff" size="small" /> : <><Ionicons name="print" size={18} color="#fff" /><Text style={styles.printBtnText}>Imprimir</Text></>}
                  </TouchableOpacity>
                </View>
              );
            })}

            {showMultiPqtx && (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.sectionTitle}>
                  🚚 Guías {assignedCarrier?.displayName} ({pqtxGuides.length})
                </Text>

                {pqtxGuides.length > 1 && (
                  <View style={styles.pqtxToolbar}>
                    <TouchableOpacity
                      style={styles.pqtxToolbarSelectBtn}
                      onPress={toggleSelectAllPqtx}
                    >
                      <Ionicons
                        name={selectedPqtx.length === pqtxGuides.length ? 'checkbox' : 'square-outline'}
                        size={18}
                        color="#1976d2"
                      />
                      <Text style={styles.pqtxToolbarSelectText}>
                        {selectedPqtx.length === 0
                          ? 'Seleccionar todas'
                          : selectedPqtx.length === pqtxGuides.length
                            ? `Todas (${selectedPqtx.length})`
                            : `${selectedPqtx.length} de ${pqtxGuides.length}`}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.pqtxToolbarPrintAll, printingAllPqtx && { opacity: 0.6 }]}
                      onPress={() => printPqtxList(pqtxGuides.map((g) => g.tracking), { format4x6: true })}
                      disabled={printingAllPqtx}
                    >
                      {printingAllPqtx ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Ionicons name="print" size={16} color="#fff" />
                      )}
                      <Text style={styles.pqtxToolbarPrintAllText}>
                        Imprimir todas ({pqtxGuides.length})
                      </Text>
                    </TouchableOpacity>
                    {selectedPqtx.length > 0 && (
                      <TouchableOpacity
                        style={styles.pqtxToolbarPrintSel}
                        onPress={() => printPqtxList(selectedPqtx, { format4x6: true })}
                        disabled={printingAllPqtx}
                      >
                        <Ionicons name="print-outline" size={16} color="#1976d2" />
                        <Text style={styles.pqtxToolbarPrintSelText}>
                          Imprimir seleccionadas ({selectedPqtx.length})
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {!shipment.master.nationalTracking && pqtxGuides.length === 0 && (
                  <TouchableOpacity
                    style={[styles.carrierPrintBtn, generatingAssignedGuide && { opacity: 0.65 }, { marginBottom: 8 }]}
                    onPress={() => printAssignedCarrierGuide({ format4x6: true })}
                    disabled={generatingAssignedGuide}
                  >
                    {generatingAssignedGuide ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="add-circle" size={18} color="#fff" />}
                    <Text style={styles.carrierPrintBtnText}>
                      {generatingAssignedGuide ? 'Generando guía...' : 'Generar guía'}
                    </Text>
                  </TouchableOpacity>
                )}

                {pqtxGuides.map((g, idx) => {
                  return (
                    <View key={`pqtx-${g.tracking}-${idx}`} style={styles.pqtxCard}>
                      <View style={styles.pqtxCardHeader}>
                        <MaterialCommunityIcons name="truck-fast" size={18} color="#1976d2" />
                        <Text style={styles.pqtxCardTitle}>
                          {g.pieces > 1
                            ? `${assignedCarrier?.displayName} — Multipieza (${g.pieces} cajas)`
                            : `Guía ${assignedCarrier?.displayName}`}
                        </Text>
                      </View>
                      <Text style={styles.pqtxCardTracking}>{g.tracking}</Text>
                      <Text style={styles.pqtxCardSubtitle}>
                        {g.pieces > 1
                          ? `Una sola guía PQTX que ampara las ${g.pieces} cajas del envío`
                          : 'Imprime la guía de la paquetería asignada'}
                      </Text>
                      <View style={styles.pqtxCardActions}>
                        <TouchableOpacity
                          style={styles.pqtxCardPrimary}
                          onPress={() => printPqtxGuide(g.tracking, { format4x6: true })}
                        >
                          <Ionicons name="print" size={16} color="#fff" />
                          <Text style={styles.pqtxCardPrimaryText}>
                            Imprimir Etiqueta {g.pieces > 1 ? `(${g.pieces} cajas)` : ''}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.pqtxCardSecondary}
                          onPress={() => printPqtxGuide(g.tracking)}
                        >
                          <Ionicons name="document-text-outline" size={16} color="#1976d2" />
                          <Text style={styles.pqtxCardSecondaryText}>Imprimir guía</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {hasAssignedCarrier && !isEntregaxLocalAssigned && !showMultiPqtx && (
              <View style={styles.carrierCard}>
                <Text style={styles.carrierTitle}>🚚 Guía {assignedCarrier?.displayName}</Text>
                <Text style={styles.carrierSubtitle}>
                  {getAssignedCarrierGuideUrl()
                    ? 'Imprime la guía de la paquetería asignada'
                    : isPaqueteExpressAssigned
                      ? 'No hay guía aún. Toca el botón para generarla y mandarla a imprimir.'
                      : 'Esta paquetería aún no tiene guía disponible para impresión'}
                </Text>
                {isPaqueteExpressAssigned ? (
                  <View style={styles.carrierButtonsCol}>
                    <TouchableOpacity
                      style={[
                        styles.carrierPrintBtn,
                        generatingAssignedGuide && { opacity: 0.65 },
                      ]}
                      onPress={() => printAssignedCarrierGuide({ format4x6: true })}
                      disabled={generatingAssignedGuide}
                    >
                      {generatingAssignedGuide ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Ionicons name="print" size={18} color="#fff" />
                      )}
                      <Text style={styles.carrierPrintBtnText}>
                        {generatingAssignedGuide ? 'Generando guía...' : 'Imprimir etiqueta'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.carrierPrintBtnSecondary,
                        generatingAssignedGuide && { opacity: 0.65 },
                        (!getAssignedCarrierGuideUrl() && !isPaqueteExpressAssigned) && { opacity: 0.55 },
                      ]}
                      onPress={() => printAssignedCarrierGuide()}
                      disabled={generatingAssignedGuide || (!getAssignedCarrierGuideUrl() && !isPaqueteExpressAssigned)}
                    >
                      <Ionicons name="document-text-outline" size={16} color={BLACK} />
                      <Text style={styles.carrierPrintBtnSecondaryText}>Imprimir guía</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.carrierPrintBtn,
                      (!getAssignedCarrierGuideUrl() && !isPaqueteExpressAssigned) && { opacity: 0.55 },
                      generatingAssignedGuide && { opacity: 0.65 },
                    ]}
                    onPress={() => printAssignedCarrierGuide()}
                    disabled={generatingAssignedGuide || (!getAssignedCarrierGuideUrl() && !isPaqueteExpressAssigned)}
                  >
                    {generatingAssignedGuide ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Ionicons name="print" size={18} color="#fff" />
                    )}
                    <Text style={styles.carrierPrintBtnText}>
                      {generatingAssignedGuide
                        ? 'Generando guía...'
                        : getAssignedCarrierGuideUrl()
                          ? 'Imprimir guía asignada'
                          : 'Guía no disponible'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {hasLocalDeliveryOption && (
              <View style={styles.carrierCard}>
                <Text style={styles.carrierTitle}>🚚 Entrega Local EntregaX</Text>
                <Text style={styles.carrierSubtitle}>Imprime la etiqueta de guía de entrega local</Text>
                <TouchableOpacity style={styles.carrierPrintBtn} onPress={printLocalDeliveryLabel}>
                  <Ionicons name="print" size={18} color="#fff" />
                  <Text style={styles.carrierPrintBtnText}>Imprimir Etiqueta Local</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={scanOpen} animationType="slide" onRequestClose={() => setScanOpen(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView style={{ flex: 1 }} facing="back" onBarcodeScanned={onScan} barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'pdf417'] }} />
          <View style={styles.scanOverlay}>
            <Text style={styles.scanText}>Apunta al código QR / barras</Text>
            <TouchableOpacity style={styles.scanCloseBtn} onPress={() => setScanOpen(false)}>
              <Text style={styles.scanCloseText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GREY_BG },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: BLACK, paddingHorizontal: 14, paddingVertical: 14 },
  headerLabel: { fontSize: 11, color: ORANGE, fontWeight: '700', letterSpacing: 1 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  searchCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14 },
  searchTitle: { fontSize: 14, fontWeight: '700', color: BLACK, marginBottom: 10 },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchInputBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F8F8', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, gap: 8, borderWidth: 1, borderColor: '#E0E0E0' },
  searchInput: { flex: 1, fontSize: 14, color: BLACK },
  scanBtn: { backgroundColor: BLACK, width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  searchSubmit: { backgroundColor: ORANGE, paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  searchSubmitText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  errorText: { color: '#D32F2F', fontSize: 12, fontWeight: '600', marginTop: 8, textAlign: 'center' },
  shipmentCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginTop: 14 },
  serviceBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14 },
  serviceBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  masterTracking: { fontSize: 18, fontWeight: '900', color: BLACK, marginTop: 8, fontFamily: 'monospace' },
  masterStatus: { fontSize: 12, color: '#666', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#EEE', marginVertical: 10 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: 10 },
  detailLabel: { fontSize: 12, color: '#666', fontWeight: '600' },
  detailValue: { fontSize: 13, color: BLACK, fontWeight: '600', flex: 1, textAlign: 'right' },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#444', marginTop: 16, marginBottom: 8, marginLeft: 4 },
  bulkActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, marginHorizontal: 4 },
  bulkSecondaryBtn: { backgroundColor: '#111', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 10 },
  bulkSecondaryBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  bulkPrimaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: ORANGE, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 10, flex: 1, justifyContent: 'center' },
  bulkPrimaryBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  labelCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 4, borderLeftColor: ORANGE, alignItems: 'center' },
  labelCardSelected: { borderWidth: 1, borderColor: ORANGE, backgroundColor: '#FFF9F5' },
  selectRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  selectRowText: { fontSize: 11, color: '#666', fontWeight: '700' },
  smallBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginBottom: 4 },
  smallBadgeText: { fontSize: 10, fontWeight: '700' },
  labelTracking: { fontSize: 13, fontWeight: '800', color: BLACK, fontFamily: 'monospace' },
  labelMeta: { fontSize: 11, color: '#666', marginTop: 2 },
  labelDest: { fontSize: 11, color: '#444', marginTop: 2 },
  carrierCard: { backgroundColor: '#FFF6F0', borderColor: ORANGE, borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 10, marginBottom: 2 },
  carrierTitle: { fontSize: 13, fontWeight: '800', color: BLACK },
  carrierSubtitle: { fontSize: 12, color: '#444', marginTop: 4 },
  carrierButtonsCol: { marginTop: 10, gap: 8 },
  carrierPrintBtn: { marginTop: 10, alignSelf: 'flex-start', flexDirection: 'row', backgroundColor: ORANGE, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', gap: 6 },
  carrierPrintBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  carrierPrintBtnSecondary: { alignSelf: 'flex-start', flexDirection: 'row', backgroundColor: '#FFE7DA', borderWidth: 1, borderColor: ORANGE, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', gap: 6 },
  carrierPrintBtnSecondaryText: { color: BLACK, fontWeight: '800', fontSize: 12 },
  printBtn: { flexDirection: 'row', backgroundColor: ORANGE, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center', gap: 6 },
  printBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  // PQTX multi-guide
  pqtxToolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#1976d2', backgroundColor: '#E3F2FD', marginBottom: 8 },
  pqtxToolbarSelectBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pqtxToolbarSelectText: { color: '#1976d2', fontWeight: '700', fontSize: 12 },
  pqtxToolbarPrintAll: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1976d2', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  pqtxToolbarPrintAllText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  pqtxToolbarPrintSel: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#1976d2', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#fff' },
  pqtxToolbarPrintSelText: { color: '#1976d2', fontWeight: '700', fontSize: 12 },
  pqtxCard: { backgroundColor: '#F3F8FF', borderColor: '#1976d2', borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  pqtxCardSelected: { borderColor: '#0d47a1', borderWidth: 2 },
  pqtxCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  pqtxCardTitle: { fontSize: 13, fontWeight: '800', color: '#1976d2', flex: 1 },
  pqtxCardTracking: { fontFamily: 'monospace', fontSize: 14, fontWeight: '700', color: BLACK, marginBottom: 4 },
  pqtxCardSubtitle: { fontSize: 11, color: '#555', marginBottom: 10 },
  pqtxCardActions: { gap: 8 },
  pqtxCardPrimary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1976d2', paddingVertical: 10, borderRadius: 8 },
  pqtxCardPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  pqtxCardSecondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#1976d2', paddingVertical: 10, borderRadius: 8, backgroundColor: '#fff' },
  pqtxCardSecondaryText: { color: '#1976d2', fontWeight: '800', fontSize: 12 },
  scanOverlay: { position: 'absolute', bottom: 50, left: 0, right: 0, alignItems: 'center', gap: 12 },
  scanText: { color: '#fff', fontSize: 14, fontWeight: '600', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  scanCloseBtn: { backgroundColor: '#fff', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 24 },
  scanCloseText: { fontWeight: '700', color: BLACK },
});
