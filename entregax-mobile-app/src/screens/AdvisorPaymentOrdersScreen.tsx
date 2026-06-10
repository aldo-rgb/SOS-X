import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Alert, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
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
const buildPdfHtml = (order: PaymentOrder): string => {
  const mxn    = Number(order.total_mxn).toLocaleString('es-MX', { minimumFractionDigits: 2 });
  const ref    = order.payment_reference || order.folio || '—';
  const date   = new Date(order.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
  const guides = (order.trackings || []).map((t, i) => `<tr><td>${i + 1}</td><td style="font-family:monospace">${t}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    body{font-family:Helvetica,Arial,sans-serif;margin:0;padding:0;color:#111}
    .hdr{background:#111;padding:24px 32px;display:flex;justify-content:space-between;align-items:center}
    .hdr-brand{color:#F05A28;font-size:22px;font-weight:800;letter-spacing:1px}
    .hdr-sub{color:#aaa;font-size:11px;margin-top:2px}
    .accent{color:#F05A28}
    .body{padding:28px 32px}
    .section{background:#F9F9F9;border-radius:8px;padding:16px;margin-bottom:16px}
    .label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px}
    .value{font-size:13px;font-weight:700;color:#111}
    .ref{font-family:monospace;font-size:18px;color:#F05A28;font-weight:800}
    .bank-box{background:#E3F2FD;border-radius:8px;padding:16px;margin-bottom:16px}
    .bank-title{color:#1565C0;font-weight:800;font-size:13px;margin-bottom:10px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    th{background:#111;color:#F05A28;font-size:11px;padding:8px;text-align:left}
    td{padding:7px 8px;font-size:12px;border-bottom:1px solid #eee}
    .total-row td{background:#111;color:#F05A28;font-weight:800;font-size:14px}
    .footer{border-top:3px solid #F05A28;padding:12px 32px;font-size:10px;color:#888;text-align:center}
  </style></head><body>
  <div class="hdr">
    <div><div class="hdr-brand">EntregaX</div><div class="hdr-sub">Orden de Pago</div></div>
    <div style="text-align:right"><div class="ref">${ref}</div><div class="hdr-sub">${date}</div></div>
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
    ${(order.trackings || []).length > 0 ? `<table>
      <thead><tr><th>#</th><th>Número de guía</th></tr></thead>
      <tbody>${guides}</tbody>
      <tfoot><tr class="total-row"><td colspan="2">TOTAL A PAGAR: $${mxn} MXN</td></tr></tfoot>
    </table>` : ''}
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
      const html  = buildPdfHtml(order);
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
