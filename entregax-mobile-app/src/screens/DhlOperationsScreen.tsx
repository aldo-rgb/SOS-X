/**
 * DhlOperationsScreen - Panel de Operaciones DHL Monterrey (móvil)
 * Mirror de DhlOperationsPage.tsx
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  FlatList, RefreshControl, ActivityIndicator, Alert, Modal,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { API_URL } from '../services/api';

const DHL_RED = '#D40511';
const DHL_YELLOW = '#FFCC00';
const BLACK = '#111';
const GREY_BG = '#F5F5F5';

interface DhlShipment {
  id: number;
  inbound_tracking: string;
  client_name: string;
  client_box_id: string;
  product_type?: 'standard' | 'high_value';
  description: string;
  weight_kg: number;
  total_cost_mxn: number | null;
  status: string;
  delivery_city: string;
  delivery_state: string;
  outbound_tracking: string | null;
  received_at: string;
  dispatched_at: string | null;
}

interface DhlStats {
  today_received: number;
  today_dispatched: number;
  pending_quote: number;
  pending_payment: number;
  ready_dispatch: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  received_mty: { label: 'Recibido', color: '#1976D2' },
  quoted: { label: 'Cotizado', color: '#FF9800' },
  paid: { label: 'Pagado', color: '#2E7D32' },
  dispatched: { label: 'Despachado', color: '#7B1FA2' },
};

export default function DhlOperationsScreen({ route, navigation }: any) {
  const { user, token } = route.params;
  const [stats, setStats] = useState<DhlStats | null>(null);
  const [shipments, setShipments] = useState<DhlShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'received' | 'dispatched'>('received');
  const [search, setSearch] = useState('');

  // supervisor pin
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [validating, setValidating] = useState(false);

  // detail modal
  const [detailItem, setDetailItem] = useState<DhlShipment | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [s1, s2] = await Promise.all([
        fetch(`${API_URL}/api/admin/dhl/stats`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/admin/dhl/shipments`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (s1.ok) setStats(await s1.json());
      if (s2.ok) setShipments(await s2.json());
    } catch (err) {
      console.error('Error fetching DHL ops:', err);
    } finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const onRefresh = () => { setRefreshing(true); fetchAll(); };

  const filtered = useMemo(() => {
    let list = shipments;
    list = list.filter((s) => tab === 'received' ? s.status === 'received_mty' : s.status === 'dispatched');
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) =>
        [s.inbound_tracking, s.client_name, s.client_box_id, s.outbound_tracking, s.description]
          .some((v) => (v || '').toLowerCase().includes(q))
      );
    }
    return list;
  }, [shipments, tab, search]);

  const validateSupervisor = async () => {
    if (!pin.trim()) { setPinError('Ingresa la clave del supervisor'); return; }
    setValidating(true); setPinError('');
    try {
      const res = await fetch(`${API_URL}/api/warehouse/validate-supervisor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setPinModalVisible(false); setPin('');
        navigation.navigate('DhlReception', { user, token });
      } else {
        setPinError('Clave de supervisor incorrecta');
      }
    } catch {
      setPinError('Error validando supervisor');
    } finally { setValidating(false); }
  };

  const handleQuote = async (shipment: DhlShipment) => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/dhl/shipments/${shipment.id}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: '{}',
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Cotización generada', `Total: $${Number(data.total_cost_mxn).toFixed(2)} MXN\nT. cambio: $${Number(data.exchange_rate).toFixed(2)}`);
        fetchAll();
        setDetailItem(null);
      } else {
        Alert.alert('Error', data.error || 'No se pudo cotizar');
      }
    } catch { Alert.alert('Error', 'Error de red'); }
    finally { setActionLoading(false); }
  };

  const handleDispatch = (shipment: DhlShipment) => {
    Alert.alert('Despachar paquete', `¿Despachar ${shipment.inbound_tracking}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Estafeta', onPress: () => doDispatch(shipment, 'estafeta'),
      },
      {
        text: 'Paq. Express', onPress: () => doDispatch(shipment, 'paquete_express'),
      },
    ]);
  };

  const doDispatch = async (shipment: DhlShipment, carrier: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/dhl/shipments/${shipment.id}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ carrier }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Despachado', `Guía: ${data.outbound_tracking || 'N/A'}`);
        fetchAll();
        setDetailItem(null);
      } else {
        Alert.alert('Error', data.error || 'No se pudo despachar');
      }
    } catch { Alert.alert('Error', 'Error de red'); }
    finally { setActionLoading(false); }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const renderItem = ({ item }: { item: DhlShipment }) => {
    const cfg = STATUS_CONFIG[item.status] || { label: item.status, color: '#888' };
    // Etiqueta de tipo: priorizar product_type, luego mapear descripciones legacy
    const legacyMap: Record<string, string> = {
      'Accesorios/Mixto': 'General',
      'Accesorios / Mixto': 'General',
      'Sensible': 'Específica',
      'Low': 'General',
      'High': 'Específica',
    };
    const typeLabel = item.product_type === 'standard'
      ? 'General'
      : item.product_type === 'high_value'
        ? 'Específica'
        : (legacyMap[item.description] || item.description);
    return (
      <TouchableOpacity style={styles.card} onPress={() => setDetailItem(item)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTracking}>{item.inbound_tracking}</Text>
          <Text style={styles.cardClient}>{item.client_box_id} · {item.client_name}</Text>
          {typeLabel ? <Text style={styles.cardDesc} numberOfLines={1}>{typeLabel}</Text> : null}
          <Text style={styles.cardDest}>📍 {item.delivery_city}, {item.delivery_state}</Text>
          {item.outbound_tracking && <Text style={styles.cardOut}>Salida: {item.outbound_tracking}</Text>}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <View style={[styles.statusBadge, { backgroundColor: cfg.color + '20' }]}>
            <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          <Text style={styles.cardWeight}>{item.weight_kg ? Number(item.weight_kg).toFixed(2) + ' kg' : ''}</Text>
          {item.total_cost_mxn ? <Text style={styles.cardCost}>${Number(item.total_cost_mxn).toFixed(0)}</Text> : null}
          <Text style={styles.cardDate}>{formatDate(tab === 'received' ? item.received_at : item.dispatched_at)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.headerLabel}>DHL · MONTERREY</Text>
          <Text style={styles.headerTitle}>Operaciones DHL</Text>
        </View>
        <TouchableOpacity onPress={onRefresh}>
          <Ionicons name="refresh" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsScroll} contentContainerStyle={styles.statsContent}>
        <StatChip num={stats?.today_received ?? 0} label="Recibidos hoy" color="#1976D2" />
        <StatChip num={stats?.pending_quote ?? 0} label="Por cotizar" color="#FF9800" />
        <StatChip num={stats?.pending_payment ?? 0} label="Por pagar" color={DHL_RED} />
        <StatChip num={stats?.ready_dispatch ?? 0} label="Listo despachar" color="#2E7D32" />
        <StatChip num={stats?.today_dispatched ?? 0} label="Despachados hoy" color="#7B1FA2" />
      </ScrollView>

      {/* Recibir paquete */}
      <TouchableOpacity style={styles.receiveBtn} onPress={() => { setPin(''); setPinError(''); setPinModalVisible(true); }}>
        <MaterialCommunityIcons name="package-variant" size={22} color="#fff" />
        <Text style={styles.receiveBtnText}>Recibir Paquete DHL</Text>
        <Ionicons name="chevron-forward" size={20} color="#fff" />
      </TouchableOpacity>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity style={[styles.tab, tab === 'received' && styles.tabActive]} onPress={() => setTab('received')}>
          <Text style={[styles.tabText, tab === 'received' && styles.tabTextActive]}>Recibidos</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'dispatched' && styles.tabActive]} onPress={() => setTab('dispatched')}>
          <Text style={[styles.tabText, tab === 'dispatched' && styles.tabTextActive]}>Despachados</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#999" />
          <TextInput style={styles.searchInput} placeholder="Buscar tracking, cliente..." placeholderTextColor="#999" value={search} onChangeText={setSearch} autoCapitalize="none" />
          {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color="#999" /></TouchableOpacity> : null}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={DHL_RED} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 30 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DHL_RED} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="cube-outline" size={48} color="#999" />
              <Text style={styles.emptyText}>{tab === 'received' ? 'Sin paquetes recibidos pendientes' : 'Sin paquetes despachados'}</Text>
            </View>
          }
        />
      )}

      {/* Supervisor PIN modal */}
      <Modal visible={pinModalVisible} transparent animationType="fade" onRequestClose={() => setPinModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.pinCard}>
            <Ionicons name="lock-closed" size={36} color={DHL_RED} />
            <Text style={styles.pinTitle}>Clave de Supervisor</Text>
            <Text style={styles.pinSubtitle}>Solicita autorización para iniciar la recepción DHL</Text>
            <TextInput
              style={styles.pinInput}
              placeholder="••••"
              placeholderTextColor="#999"
              value={pin}
              onChangeText={(v) => { setPin(v); setPinError(''); }}
              secureTextEntry
              keyboardType="number-pad"
              autoFocus
              maxLength={8}
            />
            {pinError ? <Text style={styles.pinError}>{pinError}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={[styles.pinBtn, styles.pinBtnGhost]} onPress={() => { setPinModalVisible(false); setPin(''); }}>
                <Text style={styles.pinBtnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.pinBtn, styles.pinBtnPrimary, validating && { opacity: 0.6 }]} onPress={validateSupervisor} disabled={validating}>
                {validating ? <ActivityIndicator color="#fff" /> : <Text style={styles.pinBtnPrimaryText}>Validar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Detail modal */}
      <Modal visible={!!detailItem} transparent animationType="slide" onRequestClose={() => setDetailItem(null)}>
        <View style={styles.detailOverlay}>
          <View style={styles.detailCard}>
            {detailItem && (
              <>
                <View style={styles.detailHeader}>
                  <Text style={styles.detailTitle}>{detailItem.inbound_tracking}</Text>
                  <TouchableOpacity onPress={() => setDetailItem(null)}>
                    <Ionicons name="close" size={26} color="#fff" />
                  </TouchableOpacity>
                </View>
                <ScrollView contentContainerStyle={{ padding: 16 }}>
                  <DetailRow label="Cliente" value={`${detailItem.client_box_id} · ${detailItem.client_name}`} />
                  <DetailRow label="Descripción" value={detailItem.description || '—'} />
                  <DetailRow label="Peso" value={detailItem.weight_kg ? `${Number(detailItem.weight_kg).toFixed(2)} kg` : '—'} />
                  <DetailRow label="Destino" value={`${detailItem.delivery_city}, ${detailItem.delivery_state}`} />
                  <DetailRow label="Costo" value={detailItem.total_cost_mxn ? `$${Number(detailItem.total_cost_mxn).toFixed(2)} MXN` : 'Sin cotizar'} />
                  <DetailRow label="Estatus" value={STATUS_CONFIG[detailItem.status]?.label || detailItem.status} />
                  {detailItem.outbound_tracking && <DetailRow label="Guía salida" value={detailItem.outbound_tracking} />}
                  <DetailRow label="Recibido" value={formatDate(detailItem.received_at)} />
                  {detailItem.dispatched_at && <DetailRow label="Despachado" value={formatDate(detailItem.dispatched_at)} />}

                  {detailItem.status === 'received_mty' && !detailItem.total_cost_mxn && (
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#FF9800' }]} onPress={() => handleQuote(detailItem)} disabled={actionLoading}>
                      {actionLoading ? <ActivityIndicator color="#fff" /> : <><Ionicons name="calculator" size={18} color="#fff" /><Text style={styles.actionBtnText}>Generar cotización</Text></>}
                    </TouchableOpacity>
                  )}
                  {detailItem.status === 'paid' && (
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#2E7D32' }]} onPress={() => handleDispatch(detailItem)} disabled={actionLoading}>
                      {actionLoading ? <ActivityIndicator color="#fff" /> : <><Ionicons name="send" size={18} color="#fff" /><Text style={styles.actionBtnText}>Despachar</Text></>}
                    </TouchableOpacity>
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function StatChip({ num, label, color }: { num: number; label: string; color: string }) {
  return (
    <View style={styles.statChip}>
      <Text style={[styles.statChipNum, { color }]}>{num}</Text>
      <Text style={styles.statChipLabel} numberOfLines={2}>{label}</Text>
    </View>
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
  headerLabel: { fontSize: 11, color: DHL_YELLOW, fontWeight: '700', letterSpacing: 1 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  statsScroll: { flexGrow: 0, maxHeight: 92 },
  statsContent: { paddingVertical: 10, paddingHorizontal: 12, gap: 8 },
  statChip: { width: 96, height: 72, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#ECECEC' },
  statChipNum: { fontSize: 20, fontWeight: '800', lineHeight: 24 },
  statChipLabel: { fontSize: 10, color: '#555', marginTop: 2, textAlign: 'center', lineHeight: 12 },
  receiveBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: DHL_RED, marginHorizontal: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, gap: 10, marginBottom: 8 },
  receiveBtnText: { flex: 1, color: '#fff', fontWeight: '800', fontSize: 15 },
  tabsRow: { flexDirection: 'row', marginHorizontal: 12, backgroundColor: '#fff', borderRadius: 10, padding: 4, marginBottom: 8 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: BLACK },
  tabText: { fontSize: 13, color: '#666', fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  searchWrap: { paddingHorizontal: 12, paddingBottom: 8 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, gap: 8, borderWidth: 1, borderColor: '#E0E0E0' },
  searchInput: { flex: 1, fontSize: 14, color: BLACK },
  card: { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 8, borderRadius: 10, padding: 12, borderLeftWidth: 4, borderLeftColor: DHL_RED },
  cardTracking: { fontSize: 14, fontWeight: '800', color: BLACK, fontFamily: 'monospace' },
  cardClient: { fontSize: 12, color: '#444', marginTop: 4, fontWeight: '600' },
  cardDesc: { fontSize: 11, color: '#888', marginTop: 2 },
  cardDest: { fontSize: 11, color: '#666', marginTop: 2 },
  cardOut: { fontSize: 11, color: DHL_RED, fontWeight: '700', marginTop: 2 },
  cardWeight: { fontSize: 11, fontWeight: '700', color: BLACK, marginTop: 4 },
  cardCost: { fontSize: 13, fontWeight: '800', color: '#2E7D32', marginTop: 2 },
  cardDate: { fontSize: 10, color: '#999', marginTop: 4 },
  statusBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontSize: 10, fontWeight: '700', textAlign: 'center' },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 13, color: '#999', marginTop: 10, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  pinCard: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360, alignItems: 'center' },
  pinTitle: { fontSize: 18, fontWeight: '800', color: BLACK, marginTop: 10 },
  pinSubtitle: { fontSize: 13, color: '#666', textAlign: 'center', marginTop: 4 },
  pinInput: { width: '70%', borderBottomWidth: 2, borderBottomColor: DHL_RED, fontSize: 30, textAlign: 'center', letterSpacing: 8, marginTop: 18, paddingVertical: 8, color: BLACK },
  pinError: { color: DHL_RED, fontSize: 12, fontWeight: '600', marginTop: 8 },
  pinBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  pinBtnGhost: { borderWidth: 1, borderColor: '#DDD' },
  pinBtnGhostText: { color: '#444', fontWeight: '700' },
  pinBtnPrimary: { backgroundColor: DHL_RED },
  pinBtnPrimaryText: { color: '#fff', fontWeight: '800' },
  detailOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  detailCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  detailHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: BLACK, paddingHorizontal: 16, paddingVertical: 14, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  detailTitle: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '800', fontFamily: 'monospace' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: 10 },
  detailLabel: { fontSize: 12, color: '#666', fontWeight: '600' },
  detailValue: { fontSize: 13, color: BLACK, fontWeight: '600', flex: 1, textAlign: 'right' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 10, marginTop: 14 },
  actionBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
