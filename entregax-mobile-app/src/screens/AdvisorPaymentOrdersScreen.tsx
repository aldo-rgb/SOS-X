import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Alert, ActivityIndicator, Linking, Modal, ScrollView, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
    description?: string | null;
  }>;
}

const buildPdfHtml = (order: PaymentOrder, items: OrderDetailItem[] = []): string => {
  const fmtMxn = (n: number) => Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtUsd = (n: number) => Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const mxn    = fmtMxn(Number(order.total_mxn));
  const ref    = order.payment_reference || order.folio || '—';
  const date   = new Date(order.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });

  // Si no llegan items con desglose, fallback a la lista plana de trackings
  const useDetail = items && items.length > 0;
  const detailBlocks = useDetail ? items.map((it, idx) => {
    const tcTxt = it.exchange_rate ? `TC: $${Number(it.exchange_rate).toFixed(2)}` : '';
    const headerRight = it.venta_usd
      ? `$${fmtUsd(it.venta_usd)} USD &middot; $${fmtMxn(it.venta_mxn || 0)} MXN`
      : `$${fmtMxn(it.venta_mxn || 0)} MXN`;
    const childrenHtml = (it.children || []).length > 0
      ? `<table class="detail-table">
          <thead><tr>
            <th style="width:36px">#</th>
            <th>Guía hija</th>
            <th style="width:50px">Nivel</th>
            <th style="width:90px;text-align:right">USD</th>
            <th style="width:110px;text-align:right">MXN</th>
          </tr></thead>
          <tbody>${(it.children || []).map((c, ci) => `
            <tr>
              <td>${ci + 1}</td>
              <td style="font-family:monospace;font-size:11px">${c.tracking || '—'}</td>
              <td><span class="badge">${c.n_level || '—'}</span></td>
              <td style="text-align:right">$${fmtUsd(c.venta_usd)}</td>
              <td style="text-align:right;font-weight:700">$${fmtMxn(c.venta_mxn)}</td>
            </tr>`).join('')}
          </tbody>
        </table>`
      : '';
    return `
      <div class="item-card">
        <div class="item-head">
          <div>
            <div class="item-tracking">${it.tracking || '—'}</div>
            <div class="item-meta">${it.tipo}${it.total_boxes ? ` &middot; ${it.total_boxes} cajas` : ''}${tcTxt ? ' &middot; ' + tcTxt : ''}</div>
          </div>
          <div class="item-amount">${headerRight}</div>
        </div>
        ${childrenHtml}
      </div>`;
  }).join('') : `<table class="detail-table">
    <thead><tr><th style="width:36px">#</th><th>Número de guía</th></tr></thead>
    <tbody>${(order.trackings || []).map((t, i) => `<tr><td>${i + 1}</td><td style="font-family:monospace">${t}</td></tr>`).join('')}</tbody>
  </table>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    *{box-sizing:border-box}
    body{font-family:Helvetica,Arial,sans-serif;margin:0;padding:0;color:#0F172A;background:#FFFFFF}
    .hdr{background:#111827;padding:24px 32px;display:flex;justify-content:space-between;align-items:center}
    .hdr-brand{color:#F05A28;font-size:24px;font-weight:900;letter-spacing:1px}
    .hdr-sub{color:#E5E7EB;font-size:11px;margin-top:2px;font-weight:600}
    .body{padding:24px 32px}
    .section{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px;margin-bottom:14px}
    .label{font-size:10px;color:#0F172A;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;font-weight:700}
    .value{font-size:13px;font-weight:700;color:#0F172A}
    .accent{color:#F05A28}
    .ref{font-family:monospace;font-size:20px;color:#F05A28;font-weight:900;background:#FFF7ED;padding:4px 10px;border-radius:6px;display:inline-block}
    .bank-box{background:#EFF6FF;border:2px solid #1D4ED8;border-radius:8px;padding:16px;margin-bottom:14px}
    .bank-title{color:#1D4ED8;font-weight:800;font-size:14px;margin-bottom:10px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .section-title{font-size:13px;font-weight:800;color:#0F172A;margin:18px 0 8px;padding-bottom:6px;border-bottom:2px solid #F05A28}
    .item-card{border:1px solid #E2E8F0;border-radius:8px;margin-bottom:10px;overflow:hidden}
    .item-head{background:#F1F5F9;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #E2E8F0}
    .item-tracking{font-family:monospace;font-size:13px;font-weight:800;color:#0F172A}
    .item-meta{font-size:11px;color:#334155;margin-top:2px;font-weight:600}
    .item-amount{font-size:13px;font-weight:800;color:#0F172A;text-align:right}
    .detail-table{width:100%;border-collapse:collapse}
    .detail-table th{background:#FFF7ED;color:#9A3412;font-size:10px;padding:6px 8px;text-align:left;border-bottom:1px solid #FED7AA;font-weight:800;text-transform:uppercase;letter-spacing:.4px}
    .detail-table td{padding:7px 8px;font-size:11px;color:#0F172A;border-bottom:1px solid #F1F5F9}
    .badge{display:inline-block;background:#FEE2E2;color:#B91C1C;font-weight:800;font-size:10px;padding:2px 6px;border-radius:4px}
    .total-box{background:#F05A28;color:#fff;padding:14px 18px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:16px;font-weight:900}
    .footer{border-top:3px solid #F05A28;padding:12px 32px;font-size:10px;color:#475569;text-align:center;font-weight:600}
  </style></head><body>
  <div class="hdr">
    <div><div class="hdr-brand">EntregaX</div><div class="hdr-sub">Orden de Pago</div></div>
    <div style="text-align:right"><div class="ref">${ref}</div><div class="hdr-sub" style="margin-top:6px">${date}</div></div>
  </div>
  <div class="body">
    <div class="section">
      <div class="grid">
        <div><div class="label">Cliente</div><div class="value">${order.client_name}</div></div>
        <div><div class="label">Box ID</div><div class="value">${order.client_box_id || '—'}</div></div>
        <div><div class="label">Monto total</div><div class="value accent">$${mxn} MXN</div></div>
        <div><div class="label">Estado</div><div class="value">${STATUS_LABEL[order.status]?.label || order.status}</div></div>
      </div>
    </div>
    ${order.bank_name ? `<div class="bank-box">
      <div class="bank-title">🏦 Datos bancarios para transferencia</div>
      <div class="grid">
        <div><div class="label">Banco</div><div class="value">${order.bank_name}</div></div>
        <div><div class="label">CLABE</div><div class="value" style="font-family:monospace">${order.bank_clabe || '—'}</div></div>
        <div><div class="label">Beneficiario</div><div class="value">${order.beneficiario || '—'}</div></div>
        <div><div class="label">Concepto / Referencia</div><div class="value accent">${ref}</div></div>
      </div>
    </div>` : ''}
    <div class="section-title">📦 Desglose de guías</div>
    ${detailBlocks}
    <div class="total-box">
      <span>TOTAL A PAGAR</span>
      <span>$${mxn} MXN</span>
    </div>
  </div>
  <div class="footer">EntregaX Paquetería · Este documento es válido como comprobante de cobro.</div>
  </body></html>`;
};

export default function AdvisorPaymentOrdersScreen({ navigation, route }: any) {
  const { token } = route.params;
  const [orders, setOrders]       = useState<PaymentOrder[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [showProofModal, setShowProofModal] = useState(false);
  const [selectedOrderForProof, setSelectedOrderForProof] = useState<PaymentOrder | null>(null);
  const [proofs, setProofs] = useState<any[]>([]);
  const [proofsLoading, setProofsLoading] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [declaredAmount, setDeclaredAmount] = useState<string>('');
  const [proofFile, setProofFile] = useState<{ uri: string; name: string; type: string } | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/advisor/payment-orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      Alert.alert('Error', 'No se pudieron cargar las órdenes de pago');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
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
    await loadProofs(order.id);
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

      const res = await fetch(
        `${API_URL}/api/advisor/payment-orders/${selectedOrderForProof.id}/proof`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      if (res.ok) {
        Alert.alert('Éxito', 'Comprobante subido correctamente');
        setDeclaredAmount('');
        setProofFile(null);
        await loadProofs(selectedOrderForProof.id);
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
          <TouchableOpacity style={styles.guidesRow} onPress={() => toggleExpand(o.id)}>
            <Text style={styles.guidesCount}>{guides.length} guía{guides.length !== 1 ? 's' : ''}</Text>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color="#888" />
          </TouchableOpacity>
        )}
        {expanded && (
          <View style={styles.guidesExpanded}>
            {guides.map((t, i) => (
              <View key={i} style={styles.guideChip}>
                <Text style={styles.guideChipText}>{t}</Text>
              </View>
            ))}
          </View>
        )}

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
          keyExtractor={o => String(o.id)}
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
      <Modal visible={showProofModal} transparent={true} animationType="slide" statusBarTranslucent>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={{ paddingTop: 14, paddingHorizontal: 16, paddingBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee', zIndex: 20, elevation: 4 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', flex: 1, paddingRight: 12 }}>Comprobantes de Pago</Text>
            <TouchableOpacity onPress={() => setShowProofModal(false)} hitSlop={20} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={28} color={BLACK} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1, padding: 12 }} contentContainerStyle={{ paddingBottom: 24 }}>
            {/* Existing proofs */}
            {proofsLoading ? (
              <ActivityIndicator size="large" color={ORANGE} />
            ) : proofs.length > 0 ? (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 8, color: '#666' }}>Comprobantes Subidos</Text>
                {proofs.map((proof, idx) => (
                  <View key={idx} style={{ backgroundColor: '#f5f5f5', padding: 12, borderRadius: 8, marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <View>
                        <Text style={{ fontSize: 13, fontWeight: '500', color: BLACK }}>
                          {proof.uploader_type === 'advisor' ? '👤 Asesor' : '🧑 Cliente'}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                          {new Date(proof.created_at).toLocaleDateString('es-MX')}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 13, fontWeight: '500', color: ORANGE }}>
                          ${Number(proof.declared_amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                        </Text>
                        <Text style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                          Estado: {proof.status}
                        </Text>
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

              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#666', marginBottom: 6 }}>Archivo del comprobante</Text>
                <TouchableOpacity
                  onPress={handlePickProofFile}
                  style={{
                    borderWidth: 1,
                    borderColor: '#ddd',
                    borderRadius: 6,
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    backgroundColor: '#fff',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="cloud-upload-outline" size={16} color={ORANGE} />
                    <Text style={{ fontSize: 13, color: proofFile ? BLACK : '#777', fontWeight: '500', flex: 1 }} numberOfLines={1}>
                      {proofFile ? proofFile.name : 'Seleccionar imagen o PDF'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

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
                Primero selecciona el archivo y luego pulsa subir.
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
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
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  date:       { fontSize: 11, color: '#999' },
  actionBtn:  { width: 34, height: 34, borderRadius: 8, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
});
