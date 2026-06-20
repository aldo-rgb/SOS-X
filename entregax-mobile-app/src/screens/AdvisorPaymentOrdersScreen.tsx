import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Alert, ActivityIndicator, Linking, Modal, ScrollView, TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BLACK  = '#111111';

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  pendiente:  { label: 'Pendiente',  color: '#C2410C', bg: '#FEF3C7' },
  en_proceso: { label: 'En proceso', color: '#1D4ED8', bg: '#DBEAFE' },
  pagado:     { label: 'Pagado',     color: '#15803D', bg: '#DCFCE7' },
  cancelado:  { label: 'Cancelado',  color: '#6B7280', bg: '#F3F4F6' },
};

interface PaymentOrder {
  id: number;
  folio: string | null;
  payment_reference: string | null;
  pobox_payment_id?: number | null;
  client_id: number;
  client_name: string;
  client_box_id: string;
  trackings: string[];
  total_mxn: number;
  status: string;
  created_by: string;
  created_at: string;
  bank_clabe: string | null;
  bank_name: string | null;
  beneficiario: string | null;
}

// ── WhatsApp template ─────────────────────────────────────────────────────────
const buildWhatsAppUrl = (order: PaymentOrder): string => {
  const mxn = Number(order.total_mxn).toLocaleString('es-MX', { minimumFractionDigits: 2 });
  const ref  = order.payment_reference || order.folio || '—';
  const name = (order.client_name || '').split(' ')[0];
  const lines = [
    `Hola ${name}! 👋`,
    '',
    `Tienes una orden de pago pendiente en *EntregaX*.`,
    '',
    `💰 Monto: *$${mxn} MXN*`,
    `📋 Referencia: *${ref}*`,
    '',
    `Abre la app EntregaX → *Mis Pagos* para ver el desglose y realizar tu pago. 💳`,
    '',
    `📱 Si no tienes la app descárgala aquí:`,
    `iOS → https://apps.apple.com/mx/app/entregax/id6443608707`,
    `Android → https://play.google.com/store/apps/details?id=com.entregax.mobile`,
  ];
  const text = encodeURIComponent(lines.join('\n'));
  return `https://wa.me/?text=${text}`;
};

// ── HTML template for PDF ─────────────────────────────────────────────────────
interface OrderDetailItem {
  id: number;
  tracking: string | null;
  service_type: string;
  description?: string | null;
  weight?: number;
  total_boxes?: number;
  tipo: 'POBOX' | 'MARITIMO' | 'DHL';
  venta_usd?: number;
  venta_mxn?: number;
  exchange_rate?: number;
  cbm?: number;
  children?: Array<{
    id: number;
    tracking: string | null;
    child_no: string | null;
    n_level: string | null;
    venta_usd: number;
    venta_mxn: number;
    weight: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    description?: string | null;
  }>;
}

const buildPdfHtml = (order: PaymentOrder, items: OrderDetailItem[] = []): string => {
  const fmt = (n: number) => '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ref   = order.payment_reference || order.folio || '—';
  const today = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  const pkgCount = items.length > 0 ? items.length : (order.trackings || []).length;

  let pkgRows = '';
  if (items.length > 0) {
    items.forEach((it, idx) => {
      const monto = Number(it.venta_mxn || 0);
      const peso  = it.weight ? `${Number(it.weight).toFixed(1)} lb` : '—';
      const tipo  = it.total_boxes ? `${it.tipo} (${it.total_boxes} cajas)` : (it.tipo || '—');
      pkgRows += `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px">${idx + 1}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;font-weight:600">${it.tracking || '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;text-align:center">${peso}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;text-align:center">—</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;text-align:center">${tipo}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;text-align:right;font-weight:600">${fmt(monto)}</td>
      </tr>`;
      (it.children || []).forEach((c, ci) => {
        const cdims = (c.lengthCm || 0) > 0 || (c.widthCm || 0) > 0 || (c.heightCm || 0) > 0
          ? `${c.lengthCm}×${c.widthCm}×${c.heightCm} cm` : '—';
        const cpeso = c.weight ? `${Number(c.weight).toFixed(1)} lb` : '—';
        const nivel = c.n_level ? `<span style="background:#FEE2E2;color:#B91C1C;font-size:9px;padding:1px 5px;border-radius:3px;font-weight:700">${c.n_level}</span>` : '';
        pkgRows += `<tr style="background:#FFF8F0">
          <td style="padding:4px 8px;border-bottom:1px solid #F5E6D0;font-size:10px;color:#aaa">&nbsp;↳ ${ci + 1}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #F5E6D0;font-size:10px;font-family:monospace">${c.tracking || '—'} ${nivel}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #F5E6D0;font-size:10px;text-align:center">${cpeso}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #F5E6D0;font-size:10px;text-align:center">${cdims}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #F5E6D0;font-size:10px;text-align:center">—</td>
          <td style="padding:4px 8px;border-bottom:1px solid #F5E6D0;font-size:10px;text-align:right">${fmt(c.venta_mxn)}</td>
        </tr>`;
      });
    });
  } else {
    (order.trackings || []).forEach((t, i) => {
      pkgRows += `<tr><td style="padding:6px 8px;font-size:11px">${i + 1}</td><td colspan="5" style="padding:6px 8px;font-size:11px;font-family:monospace">${t}</td></tr>`;
    });
  }

  const totalMxn = fmt(Number(order.total_mxn) || 0);
  const CSS = `@page{margin:30px 40px;size:A4}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#333;font-size:12px;line-height:1.5}.header{display:flex;justify-content:space-between;align-items:center;padding-bottom:15px;border-bottom:3px solid #FF6B00;margin-bottom:20px}.logo-text{font-size:26px;font-weight:900;color:#FF6B00;letter-spacing:1px;line-height:1}.logo-sub{font-size:11px;color:#888;margin-top:3px}.company-info{text-align:right;font-size:10px;color:#666}.company-info strong{color:#333;font-size:11px}.title-bar{background:linear-gradient(135deg,#FF6B00,#E55A00);color:white;padding:12px 20px;border-radius:6px;margin-bottom:20px}.title-bar h1{font-size:16px;font-weight:700}.title-bar .ref{font-size:11px;opacity:.9;margin-top:2px}.section{margin-bottom:16px}.section-title{font-size:12px;font-weight:700;color:#FF6B00;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #FFE0C0}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px}.info-row{display:flex;gap:8px}.info-label{color:#888;font-size:11px;min-width:120px}.info-value{font-weight:600;font-size:11px}table{width:100%;border-collapse:collapse;margin-top:6px}th{background:#F8F8F8;padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:#555;text-transform:uppercase;border-bottom:2px solid #FF6B00}th:last-child{text-align:right}.total-row td{padding:10px;font-weight:700;font-size:13px;border-top:2px solid #FF6B00;background:#FFF8F0}.payment-box{background:#F9FBF5;border:1px solid #C8E6C9;border-radius:8px;padding:16px;margin-top:8px}.bank-row{margin-bottom:4px;font-size:11px}.bank-label{color:#666;display:inline-block;min-width:100px}.bank-value{font-weight:700;color:#333}.warning-box{background:#FFF3E0;border-left:4px solid #FF9800;padding:10px 14px;margin-top:12px;border-radius:0 6px 6px 0;font-size:10px;color:#E65100}.important-box{background:#D32F2F;color:#fff;padding:14px 18px;margin-top:12px;border-radius:6px;text-align:center;font-size:12px;font-weight:700;letter-spacing:.3px}.instructions-box{background:#F3F8FF;border:1px solid #BBDEFB;border-radius:8px;padding:14px;margin-top:12px}.instructions-box h3{font-size:11px;color:#1565C0;margin-bottom:8px}.instructions-box ol{padding-left:18px;font-size:10px;color:#444}.instructions-box ol li{margin-bottom:4px}.footer{margin-top:24px;padding-top:12px;border-top:1px solid #ddd;font-size:9px;color:#999;text-align:center}.terms{margin-top:16px;padding:12px;background:#FAFAFA;border-radius:6px;font-size:8.5px;color:#999;line-height:1.6}.terms strong{color:#666}`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
  <div class="header">
    <div><div class="logo-text">EntregaX</div><div class="logo-sub">Paqueteria Internacional</div></div>
    <div class="company-info"><strong>ENTREGAX</strong><br>Monterrey, Nuevo Leon, Mexico<br>contacto@entregax.com<br>www.entregax.com</div>
  </div>
  <div class="title-bar">
    <h1>COTIZACION DE SERVICIOS LOGISTICOS</h1>
    <div class="ref">Folio de Referencia: <strong>${ref}</strong> &nbsp;|&nbsp; Fecha de Emision: ${today}</div>
  </div>
  <div class="section">
    <div class="section-title">1. Datos del Cliente</div>
    <div class="info-grid">
      <div class="info-row"><span class="info-label">Nombre / Razon Social:</span><span class="info-value">${order.client_name || '—'}</span></div>
      <div class="info-row"><span class="info-label">Casillero:</span><span class="info-value">${order.client_box_id || '—'}</span></div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">2. Detalle del Embarque</div>
    <div class="info-grid">
      <div class="info-row"><span class="info-label">Servicio:</span><span class="info-value">PO Box USA - Carga Aerea</span></div>
      <div class="info-row"><span class="info-label">Origen:</span><span class="info-value">Estados Unidos</span></div>
      <div class="info-row"><span class="info-label">Destino:</span><span class="info-value">Monterrey, N.L., Mexico</span></div>
      <div class="info-row"><span class="info-label">Paquetes:</span><span class="info-value">${pkgCount} paquete(s)</span></div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">3. Desglose de Costos (MXN)</div>
    <table>
      <thead><tr>
        <th style="width:30px">#</th>
        <th>Guia / Tracking</th>
        <th style="text-align:center">Peso</th>
        <th style="text-align:center">Medidas</th>
        <th style="text-align:center">Paqueteria</th>
        <th style="text-align:right">Monto (MXN)</th>
      </tr></thead>
      <tbody>
        ${pkgRows}
        <tr class="total-row">
          <td colspan="5" style="text-align:right;padding-right:10px">TOTAL A PAGAR:</td>
          <td style="text-align:right;color:#E65100;font-size:14px">${totalMxn} MXN</td>
        </tr>
      </tbody>
    </table>
  </div>
  ${order.bank_name || order.bank_clabe ? `
  <div class="section">
    <div class="section-title">Instrucciones de Pago</div>
    <p style="font-size:11px;color:#555;margin-bottom:8px">Para garantizar el despacho de su mercancia, le solicitamos realizar el pago correspondiente:</p>
    <div class="payment-box">
      <div class="bank-row"><span class="bank-label">Banco:</span> <span class="bank-value">${order.bank_name || '—'}</span></div>
      <div class="bank-row"><span class="bank-label">Beneficiario:</span> <span class="bank-value">${order.beneficiario || '—'}</span></div>
      <div class="bank-row"><span class="bank-label">CLABE:</span> <span class="bank-value">${order.bank_clabe || '—'}</span></div>
      <div class="bank-row"><span class="bank-label">Concepto / Referencia:</span> <span class="bank-value" style="color:#E65100;font-size:13px">${ref}</span></div>
    </div>
    <div class="warning-box">Favor de realizar depositos de no mas de $90,000 pesos por deposito.</div>
    <div class="important-box">IMPORTANTE: Debe incluir el numero de referencia <span style="background:#fff;color:#D32F2F;padding:2px 8px;border-radius:4px;font-size:14px">${ref}</span> en el concepto de pago. Sin esta referencia, su pago NO podra ser acreditado.</div>
  </div>` : ''}
  <div class="section">
    <div class="instructions-box">
      <h3>Confirmacion de Pago</h3>
      <ol>
        <li>Una vez realizado el pago, ingrese a su portal en <strong>www.entregax.app</strong></li>
        <li>Dirijase a la seccion <strong>"Mis Cuentas por Pagar"</strong></li>
        <li>Seleccione la opcion <strong>"Ordenes de Pago"</strong></li>
        <li>Envie el comprobante de pago en formato PDF o JPG</li>
        <li>Para depositos en efectivo, puede tardar de <strong>24 a 48 horas</strong> en verse reflejado</li>
      </ol>
    </div>
  </div>
  <div class="terms"><strong>Terminos y Condiciones:</strong><br>Los tiempos de transito son estimados y estan sujetos a revisiones aduanales, clima y disponibilidad de espacio en aerolineas/navieras. Los costos aduanales pueden variar segun el dictamen final de la autoridad. Esta cotizacion no incluye almacenajes prolongados en destino ni maniobras especiales. Los precios estan expresados en Moneda Nacional (MXN) y son validos al momento de la emision de este documento.</div>
  <div class="footer">ENTREGAX &nbsp;|&nbsp; Monterrey, N.L., Mexico &nbsp;|&nbsp; contacto@entregax.com &nbsp;|&nbsp; www.entregax.com<br>Documento generado el ${today}. Este documento es una cotizacion informativa y no representa un comprobante fiscal.</div>
  </body></html>`;
};

export default function AdvisorPaymentOrdersScreen({ navigation, route }: any) {
  const { token } = route.params;
  const insets = useSafeAreaInsets();
  const [orders, setOrders]       = useState<PaymentOrder[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [orderDetails, setOrderDetails] = useState<Record<number, { loading: boolean; items: OrderDetailItem[] }>>({});
  const [showProofModal, setShowProofModal] = useState(false);
  const [selectedOrderForProof, setSelectedOrderForProof] = useState<PaymentOrder | null>(null);
  const [proofs, setProofs] = useState<any[]>([]);
  const [proofsLoading, setProofsLoading] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [declaredAmount, setDeclaredAmount] = useState<string>('');
  const [proofFile, setProofFile] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [deletingProofId, setDeletingProofId] = useState<number | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/advisor/payment-orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const STATUS_ORDER: Record<string, number> = { pendiente: 0, en_proceso: 1, pagado: 2, cancelado: 3 };
      const sorted = (Array.isArray(data) ? data : []).sort((a: PaymentOrder, b: PaymentOrder) =>
        (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
      );
      setOrders(sorted);
    } catch {
      Alert.alert('Error', 'No se pudieron cargar las órdenes de pago');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const loadOrderDetail = useCallback(async (order: PaymentOrder) => {
    setOrderDetails(prev => ({ ...prev, [order.id]: { loading: true, items: prev[order.id]?.items || [] } }));
    try {
      const res = await fetch(`${API_URL}/api/advisor/payment-orders/${order.id}/detail?source=${order.created_by}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setOrderDetails(prev => ({ ...prev, [order.id]: { loading: false, items: Array.isArray(data.items) ? data.items : [] } }));
    } catch {
      setOrderDetails(prev => ({ ...prev, [order.id]: { loading: false, items: [] } }));
    }
  }, [token]);

  const toggleExpand = (order: PaymentOrder) => {
    const willExpand = !expandedIds.has(order.id);
    if (willExpand && !orderDetails[order.id]) loadOrderDetail(order);
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(order.id) ? next.delete(order.id) : next.add(order.id);
      return next;
    });
  };

  const handleDelete = (order: PaymentOrder) => {
    Alert.alert(
      'Cancelar orden',
      '¿Estás seguro de que deseas cancelar esta orden? El cliente dejará de verla en Mis Pagos.',
      [
        { text: 'No, conservar', style: 'cancel' },
        {
          text: 'Sí, cancelar', style: 'destructive',
          onPress: async () => {
            setDeletingId(order.id);
            try {
              const res = await fetch(`${API_URL}/api/advisor/payment-orders/${order.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) throw new Error('Error al cancelar');
              setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'cancelado' } : o));
            } catch {
              Alert.alert('Error', 'No se pudo cancelar la orden');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  const handlePdf = async (order: PaymentOrder) => {
    setPdfLoadingId(order.id);
    try {
      // Intentar obtener detalle con desglose por guía hija
      let items: OrderDetailItem[] = [];
      try {
        const res = await fetch(`${API_URL}/api/advisor/payment-orders/${order.id}/detail`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          items = Array.isArray(data?.items) ? data.items : [];
        }
      } catch (e) {
        // Si falla el detail, seguimos con el PDF básico (fallback a trackings)
        console.warn('[PDF] detail fetch failed', e);
      }
      const html = buildPdfHtml(order, items);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Orden ${order.payment_reference || order.folio}`,
        UTI: 'com.adobe.pdf',
      });
    } catch {
      Alert.alert('Error', 'No se pudo generar el PDF');
    } finally {
      setPdfLoadingId(null);
    }
  };

  const handleWhatsApp = (order: PaymentOrder) => {
    const url = buildWhatsAppUrl(order);
    Linking.canOpenURL(url).then(ok => {
      if (ok) Linking.openURL(url);
      else Alert.alert('WhatsApp no disponible', 'Instala WhatsApp para compartir esta orden.');
    });
  };

  const loadProofs = async (orderId: number) => {
    setProofsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/advisor/payment-orders/${orderId}/proofs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setProofs(Array.isArray(data?.proofs) ? data.proofs : []);
    } catch (err) {
      Alert.alert('Error', 'No se pudieron cargar los comprobantes');
      console.error(err);
    } finally {
      setProofsLoading(false);
    }
  };

  const handleProofsPress = async (order: PaymentOrder) => {
    setSelectedOrderForProof(order);
    setDeclaredAmount('');
    setProofFile(null);
    setShowProofModal(true);
    await loadProofs(order.pobox_payment_id || order.id);
  };

  const handlePickProofFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return;
      const file = result.assets?.[0];
      if (!file?.uri) return;

      setProofFile({
        uri: file.uri,
        name: file.name || 'comprobante.pdf',
        type: file.mimeType || (file.name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
      });
    } catch (error) {
      console.error('Error selecting proof file:', error);
      Alert.alert('Error', 'No se pudo abrir el selector de archivos');
    }
  };

  const takeProofFromSource = async (source: 'camera' | 'library') => {
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert('Error', 'Se necesita permiso para usar la cámara'); return; }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { Alert.alert('Error', 'Se necesita permiso para acceder a la galería'); return; }
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.8, mediaTypes: ImagePicker.MediaTypeOptions.Images })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setProofFile({
        uri: asset.uri,
        name: asset.fileName || 'comprobante.jpg',
        type: asset.mimeType || 'image/jpeg',
      });
    } catch (error) {
      console.error('Error selecting photo:', error);
      Alert.alert('Error', source === 'camera' ? 'No se pudo abrir la cámara' : 'No se pudo abrir la galería');
    }
  };

  const handlePickProofPhoto = () => {
    Alert.alert(
      'Subir comprobante',
      '¿De dónde quieres obtener la foto?',
      [
        { text: '📷 Cámara', onPress: () => takeProofFromSource('camera') },
        { text: '🖼️ Galería', onPress: () => takeProofFromSource('library') },
        { text: 'Cancelar', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const handleUploadProof = async () => {
    if (!selectedOrderForProof || !declaredAmount) {
      Alert.alert('Error', 'Por favor ingresa el monto del comprobante');
      return;
    }
    if (!proofFile) {
      Alert.alert('Error', 'Selecciona un archivo de comprobante');
      return;
    }

    try {
      setUploadingProof(true);

      // Crear FormData
      const formData = new FormData();
      formData.append('proof', proofFile as any);
      formData.append('declared_amount', declaredAmount);
      formData.append('currency', 'MXN');

      const poboxId = selectedOrderForProof.pobox_payment_id || selectedOrderForProof.id;
      const res = await fetch(
        `${API_URL}/api/advisor/payment-orders/${poboxId}/proof`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      if (res.ok) {
        setDeclaredAmount('');
        setProofFile(null);
        await loadProofs(poboxId);
        await load();
      } else {
        const err = await res.json().catch(() => null);
        Alert.alert('Error', err?.error || 'No se pudo subir el comprobante');
      }
    } catch (err) {
      Alert.alert('Error', 'Error al subir el comprobante');
      console.error(err);
    } finally {
      setUploadingProof(false);
    }
  };

  const handleDeleteProof = (proofId: number) => {
    Alert.alert(
      'Eliminar comprobante',
      '¿Seguro que deseas eliminar este comprobante? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive',
          onPress: async () => {
            if (!selectedOrderForProof) return;
            const poboxId = selectedOrderForProof.pobox_payment_id || selectedOrderForProof.id;
            setDeletingProofId(proofId);
            try {
              const res = await fetch(
                `${API_URL}/api/advisor/payment-orders/${poboxId}/proof/${proofId}`,
                { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
              );
              if (!res.ok) throw new Error('Error al eliminar');
              await loadProofs(poboxId);
              await load();
            } catch {
              Alert.alert('Error', 'No se pudo eliminar el comprobante');
            } finally {
              setDeletingProofId(null);
            }
          },
        },
      ]
    );
  };

  const renderOrder = ({ item: o }: { item: PaymentOrder }) => {
    const st     = STATUS_LABEL[o.status] ?? { label: o.status, color: '#888', bg: '#EEE' };
    const isPending = o.status === 'pendiente';
    const isAdvisor = o.created_by === 'advisor';
    const expanded  = expandedIds.has(o.id);
    const mxn       = Number(o.total_mxn).toLocaleString('es-MX', { minimumFractionDigits: 2 });
    const guides    = o.trackings || [];
    const date      = new Date(o.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

    return (
      <View style={styles.card}>
        {/* Reference row */}
        <View style={styles.cardHeader}>
          <Text style={styles.ref}>{o.payment_reference || o.folio || '—'}</Text>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <View style={[styles.statusChip, { backgroundColor: st.bg }]}>
              <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
            </View>
            <View style={[styles.originChip, { borderColor: isAdvisor ? ORANGE : '#0288d1' }]}>
              <Text style={[styles.originText, { color: isAdvisor ? ORANGE : '#0288d1' }]}>{isAdvisor ? 'Asesor' : 'Cliente'}</Text>
            </View>
          </View>
        </View>

        {/* Client + amount */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <View>
            <Text style={styles.clientName}>{o.client_name}</Text>
            <Text style={styles.clientBox}>{o.client_box_id}</Text>
          </View>
          <Text style={styles.amount}>${mxn} MXN</Text>
        </View>

        {/* Guides row */}
        {guides.length > 0 && (
          <TouchableOpacity style={styles.guidesRow} onPress={() => toggleExpand(o)}>
            <Text style={styles.guidesCount}>{guides.length} guía{guides.length !== 1 ? 's' : ''}</Text>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color="#888" />
          </TouchableOpacity>
        )}
        {expanded && (() => {
          const detail = orderDetails[o.id];
          const items = detail?.items || [];
          const dimsOf = (l?: number, w?: number, h?: number) =>
            (Number(l) > 0 || Number(w) > 0 || Number(h) > 0) ? `${l}×${w}×${h} cm` : '';
          // Aplanar: item; si tiene hijas, mostrar las hijas con peso/medidas
          const rows: { tracking: string; weight: number; dims: string; nivel?: string | null; child?: boolean }[] = [];
          for (const it of items) {
            const kids = it.children || [];
            rows.push({ tracking: it.tracking || '—', weight: Number(it.weight) || 0, dims: dimsOf((it as any).lengthCm, (it as any).widthCm, (it as any).heightCm) });
            for (const c of kids) {
              rows.push({ tracking: c.tracking || '—', weight: Number(c.weight) || 0, dims: dimsOf(c.lengthCm, c.widthCm, c.heightCm), nivel: c.n_level, child: true });
            }
          }
          return (
            <View style={[styles.guidesExpanded, (detail?.loading || rows.length > 0) && styles.guidesDetailWrap]}>
              {detail?.loading ? (
                <Text style={styles.guideDetailMeta}>Cargando detalle…</Text>
              ) : rows.length > 0 ? (
                rows.map((r, i) => (
                  <View key={i} style={[styles.guideDetailRow, r.child && { paddingLeft: 14 }]}>
                    <Text style={[styles.guideDetailTracking, r.child && { fontWeight: '400', color: '#555' }]} numberOfLines={1}>
                      {r.child ? '↳ ' : ''}{r.tracking}{r.nivel ? `  ${r.nivel}` : ''}
                    </Text>
                    <Text style={styles.guideDetailMeta}>
                      {r.weight > 0 ? `${r.weight.toFixed(1)} lb` : '—'}{r.dims ? `  ·  ${r.dims}` : ''}
                    </Text>
                  </View>
                ))
              ) : (
                guides.map((t, i) => (
                  <View key={i} style={styles.guideChip}>
                    <Text style={styles.guideChipText}>{t}</Text>
                  </View>
                ))
              )}
            </View>
          );
        })()}

        {/* Date + actions */}
        <View style={styles.cardFooter}>
          <Text style={styles.date}>{date}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={() => handleWhatsApp(o)} style={styles.actionBtn}>
              <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handlePdf(o)} style={styles.actionBtn} disabled={pdfLoadingId === o.id}>
              {pdfLoadingId === o.id
                ? <ActivityIndicator size="small" color={ORANGE} />
                : <Ionicons name="download-outline" size={18} color={ORANGE} />
              }
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleProofsPress(o)} style={styles.actionBtn}>
              <Ionicons name="document-text-outline" size={18} color="#6366f1" />
            </TouchableOpacity>
            {isPending && isAdvisor && (
              <TouchableOpacity onPress={() => handleDelete(o)} style={styles.actionBtn} disabled={deletingId === o.id}>
                {deletingId === o.id
                  ? <ActivityIndicator size="small" color="#e53e3e" />
                  : <Ionicons name="close-circle-outline" size={18} color="#e53e3e" />
                }
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 8 }}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.headerTitle}>Órdenes de Pago</Text>
          <Text style={styles.headerSub}>{orders.length} órdenes</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={o => `${o.created_by}-${o.id}`}
          renderItem={renderOrder}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[ORANGE]} />}
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Ionicons name="receipt-outline" size={48} color="#ccc" />
              <Text style={{ color: '#999', marginTop: 12, fontSize: 14 }}>No hay órdenes de pago</Text>
            </View>
          }
        />
      )}

      {/* Proofs Modal */}
      <Modal visible={showProofModal} transparent={false} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee' }}>
            <Text style={{ fontSize: 16, fontWeight: '600', flex: 1, paddingRight: 12 }}>Comprobantes de Pago</Text>
            <TouchableOpacity onPress={() => setShowProofModal(false)} hitSlop={20} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={28} color={BLACK} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1, padding: 12 }} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
            {/* Existing proofs */}
            {proofsLoading ? (
              <ActivityIndicator size="large" color={ORANGE} />
            ) : proofs.length > 0 ? (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 8, color: '#666' }}>Comprobantes Subidos</Text>
                {proofs.map((proof, idx) => (
                  <View key={idx} style={{ backgroundColor: '#f5f5f5', padding: 12, borderRadius: 8, marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '500', color: BLACK }}>
                          {proof.uploader_type === 'advisor' ? '👤 Asesor' : '🧑 Cliente'}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                          {new Date(proof.created_at).toLocaleDateString('es-MX')}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: 10 }}>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 13, fontWeight: '500', color: ORANGE }}>
                            ${Number(proof.declared_amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                          </Text>
                          <Text style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                            Estado: {proof.status}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => handleDeleteProof(proof.id)}
                          disabled={deletingProofId === proof.id}
                          style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fee2e2', borderRadius: 6 }}
                        >
                          {deletingProofId === proof.id
                            ? <ActivityIndicator size="small" color="#e53e3e" />
                            : <Ionicons name="trash-outline" size={16} color="#e53e3e" />
                          }
                        </TouchableOpacity>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => Linking.openURL(proof.file_url)} style={{ marginTop: 8 }}>
                      <Text style={{ color: '#0288d1', fontSize: 12, fontWeight: '500' }}>Ver archivo →</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <View style={{ alignItems: 'center', marginTop: 20, marginBottom: 20 }}>
                <Ionicons name="document-outline" size={32} color="#ccc" />
                <Text style={{ color: '#999', marginTop: 8, fontSize: 12 }}>Sin comprobantes todavía</Text>
              </View>
            )}

            {/* Upload section */}
            <View style={{ backgroundColor: '#f9f9f9', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#eee' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 12, color: BLACK }}>Subir Comprobante de Pago</Text>
              
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#666', marginBottom: 6 }}>Monto Declarado (MXN)</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingHorizontal: 10 }}>
                  <Text style={{ fontSize: 16, color: ORANGE, fontWeight: '600' }}>$</Text>
                  <TextInput
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    value={declaredAmount}
                    onChangeText={setDeclaredAmount}
                    style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, fontSize: 14 }}
                  />
                </View>
              </View>

              {/* File picker buttons */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                <TouchableOpacity
                  onPress={handlePickProofFile}
                  style={{ flex: 1, borderWidth: 1, borderColor: proofFile ? ORANGE : '#ddd', borderRadius: 6, paddingVertical: 10, paddingHorizontal: 8, backgroundColor: '#fff', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                >
                  <Ionicons name="document-attach-outline" size={18} color={ORANGE} />
                  <Text style={{ fontSize: 12, color: BLACK, fontWeight: '500' }}>Archivo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handlePickProofPhoto}
                  style={{ flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingVertical: 10, paddingHorizontal: 8, backgroundColor: '#fff', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                >
                  <Ionicons name="camera-outline" size={18} color={ORANGE} />
                  <Text style={{ fontSize: 12, color: BLACK, fontWeight: '500' }}>Foto</Text>
                </TouchableOpacity>
              </View>

              {/* Selected file name */}
              {proofFile && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, backgroundColor: '#FFF3EC', borderRadius: 6, padding: 8 }}>
                  <Ionicons name="checkmark-circle" size={14} color={ORANGE} />
                  <Text style={{ fontSize: 12, color: BLACK, flex: 1 }} numberOfLines={1}>{proofFile.name}</Text>
                  <TouchableOpacity onPress={() => setProofFile(null)}>
                    <Ionicons name="close-circle" size={16} color="#999" />
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                onPress={handleUploadProof}
                disabled={uploadingProof || !declaredAmount || !proofFile}
                style={{
                  backgroundColor: uploadingProof || !declaredAmount || !proofFile ? '#ddd' : ORANGE,
                  padding: 12,
                  borderRadius: 6,
                  alignItems: 'center',
                }}
              >
                {uploadingProof ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="paper-plane-outline" size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Subir Comprobante</Text>
                  </View>
                )}
              </TouchableOpacity>

              <Text style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
                Puedes subir varios comprobantes. Ingresa el monto de cada uno antes de subir.
              </Text>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    backgroundColor: BLACK, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 12,
  },
  headerTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  headerSub:   { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 1 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06,
    shadowRadius: 4, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ref:  { fontFamily: 'monospace', fontSize: 15, fontWeight: '800', color: ORANGE },
  statusChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  originChip: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  originText: { fontSize: 10, fontWeight: '600' },
  clientName: { fontSize: 13, fontWeight: '700', color: BLACK },
  clientBox:  { fontSize: 11, color: '#888', marginTop: 1 },
  amount:     { fontSize: 16, fontWeight: '800', color: ORANGE },
  guidesRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  guidesCount: { fontSize: 12, color: '#666', flex: 1 },
  guidesExpanded: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  guideChip:  { backgroundColor: '#F5F5F5', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1, borderColor: '#E5E5E5' },
  guideChipText: { fontSize: 10, color: '#555', fontFamily: 'monospace' },
  guidesDetailWrap: { flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'stretch', width: '100%' },
  guideDetailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  guideDetailTracking: { fontSize: 11, color: '#222', fontWeight: '600', fontFamily: 'monospace', flexShrink: 1, marginRight: 8 },
  guideDetailMeta: { fontSize: 11, color: '#888' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  date:       { fontSize: 11, color: '#999' },
  actionBtn:  { width: 34, height: 34, borderRadius: 8, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
});
