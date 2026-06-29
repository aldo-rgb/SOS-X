/**
 * CobranzaPendingScreen
 * Lista de pagos pendientes por confirmar para un servicio.
 * GET /api/admin/finance/pending-payments?service_type=...
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BG = '#F4F6F8';
const GREEN = '#2E7D32';
const BLUE = '#1976D2';

const METHOD_LABEL: Record<string, string> = { efectivo: 'Efectivo', cash: 'Efectivo', spei: 'SPEI', paypal: 'PayPal' };
const METHOD_COLOR: Record<string, string> = { efectivo: GREEN, cash: GREEN, spei: BLUE, paypal: '#0070BA' };

const money = (n: number) => `$${(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

interface PendingPayment {
  id: number;
  referencia: string;
  monto: number;
  concepto: string;
  created_at: string;
  tipo_servicio: string;
  payment_method: string;
  cliente: string;
  cliente_numero: string;
  source: 'webhook' | 'pobox';
  voucher_count: number;
  pobox_payment_id?: number | null;
}

export default function CobranzaPendingScreen({ navigation, route }: any) {
  const { user, token, serviceType, serviceLabel } = route.params;
  const [items, setItems] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/finance/pending-payments?service_type=${encodeURIComponent(serviceType)}&limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setItems(data.pending_payments || []);
    } catch (e) {
      console.error('Error pendientes cobranza:', e);
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, serviceType]);

  useEffect(() => { load(); }, [load]);
  // Recargar al volver del detalle (por si se confirmó un pago).
  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const total = items.reduce((s, p) => s + (Number(p.monto) || 0), 0);

  const renderItem = ({ item }: { item: PendingPayment }) => {
    const mColor = METHOD_COLOR[item.payment_method] || '#888';
    const orderId = item.source === 'webhook' ? item.pobox_payment_id : item.id;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('CobranzaPaymentDetail', { user, token, referencia: item.referencia, orderId, payment: item })}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.ref} numberOfLines={1}>{item.referencia}</Text>
          <Text style={styles.cliente} numberOfLines={1}>
            {item.cliente_numero ? `${item.cliente_numero} · ` : ''}{item.cliente || 'Cliente'}
          </Text>
          <View style={styles.metaRow}>
            <View style={[styles.methodChip, { backgroundColor: mColor + '18' }]}>
              <Text style={[styles.methodTxt, { color: mColor }]}>{METHOD_LABEL[item.payment_method] || item.payment_method}</Text>
            </View>
            {item.voucher_count > 0 && (
              <View style={styles.voucherChip}>
                <Ionicons name="image-outline" size={12} color="#B26A00" />
                <Text style={styles.voucherTxt}>{item.voucher_count}</Text>
              </View>
            )}
            <Text style={styles.date}>{fmtDate(item.created_at)}</Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.monto}>{money(item.monto)}</Text>
          <Ionicons name="chevron-forward" size={18} color="#bbb" />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={ORANGE} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Pendientes por cobrar</Text>
          <Text style={styles.headerSub}>{serviceLabel}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => `${it.source}-${it.id}`}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
          ListHeaderComponent={items.length > 0 ? (
            <View style={styles.summary}>
              <Text style={styles.summaryTxt}>{items.length} {items.length === 1 ? 'pago' : 'pagos'} · {money(total)}</Text>
            </View>
          ) : null}
          ListEmptyComponent={(
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-circle-outline" size={48} color="#9CCC65" />
              <Text style={styles.emptyTxt}>Sin pagos pendientes en {serviceLabel}</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { backgroundColor: ORANGE, paddingHorizontal: 8, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 4 },
  back: { padding: 4 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  summary: { paddingBottom: 10 },
  summaryTxt: { fontSize: 13, fontWeight: '700', color: '#555' },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  ref: { fontSize: 14, fontWeight: '800', color: '#222', fontFamily: 'monospace' },
  cliente: { fontSize: 13, color: '#555', marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  methodChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  methodTxt: { fontSize: 11, fontWeight: '700' },
  voucherChip: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#FFF3E0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  voucherTxt: { fontSize: 11, fontWeight: '700', color: '#B26A00' },
  date: { fontSize: 11, color: '#999' },
  monto: { fontSize: 16, fontWeight: '800', color: '#222' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTxt: { color: '#888', fontSize: 14, textAlign: 'center', paddingHorizontal: 30 },
});
