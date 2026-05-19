import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#111111';
const GREEN = '#4CAF50';

const STATUS_LABELS: Record<string, string> = {
  in_transit: 'En tránsito',
  received_china: 'Recibido China',
  received: 'En bodega',
  customs: 'En aduana',
  ready_pickup: 'Listo para recoger',
  delivered: 'Entregado',
  pending: 'Pendiente',
};

const FILTER_CONFIG: Record<string, { title: string; color: string; icon: string }> = {
  in_transit: { title: 'En Tránsito', color: '#2196F3', icon: 'airplane' },
  awaiting_payment: { title: 'Por Pagar', color: '#FF9800', icon: 'card' },
  missing_instructions: { title: 'Sin Instrucciones', color: '#f44336', icon: 'alert-circle' },
};

interface Shipment {
  uid: string;
  id: number;
  tracking_number: string | null;
  status: string;
  goods_name: string | null;
  client_name: string;
  client_box_id: string;
  client_id: number;
  saldo_pendiente: number;
  client_paid: boolean;
  has_instructions: boolean;
}

interface ClientAddress {
  id: number;
  alias: string | null;
  recipient_name: string | null;
  street: string;
  exterior_number: string;
  interior_number: string | null;
  colony: string | null;
  city: string;
  state: string;
  zip_code: string;
  is_default: boolean;
}

function getInitialFilters(filter: string) {
  if (filter === 'awaiting_payment') return { payment: 'pending' as const, instructions: 'all' as const };
  if (filter === 'missing_instructions') return { payment: 'all' as const, instructions: 'no' as const };
  return { payment: 'all' as const, instructions: 'all' as const };
}

export default function AdvisorPackagesScreen({ navigation, route }: any) {
  const { token, filter: routeFilter } = route.params;
  const config = FILTER_CONFIG[routeFilter] || FILTER_CONFIG.in_transit;
  const statusFilter = routeFilter === 'in_transit' ? 'in_transit' : undefined;
  const initFilters = getInitialFilters(routeFilter);

  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'pending'>(initFilters.payment);
  const [instructionsFilter, setInstructionsFilter] = useState<'all' | 'yes' | 'no'>(initFilters.instructions);

  // Instruction assignment modal
  const [instrModal, setInstrModal] = useState(false);
  const [instrShipment, setInstrShipment] = useState<Shipment | null>(null);
  const [instrAddresses, setInstrAddresses] = useState<ClientAddress[]>([]);
  const [instrLoading, setInstrLoading] = useState(false);
  const [instrSaving, setInstrSaving] = useState(false);
  const [instrSelectedId, setInstrSelectedId] = useState<number | null>(null);

  const buildUrl = useCallback(() => {
    let url = `${API_URL}/api/advisor/shipments?page=1&limit=50`;
    if (statusFilter) url += `&filter=${statusFilter}`;
    if (paymentFilter !== 'all') url += `&payment=${paymentFilter}`;
    if (instructionsFilter !== 'all') url += `&instructions=${instructionsFilter}`;
    return url;
  }, [statusFilter, paymentFilter, instructionsFilter]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetch(buildUrl(), { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      const list = (data.shipments || []).map((s: any): Shipment => ({
        uid: s.uid ?? `PKG-${s.id}`,
        id: s.id,
        tracking_number: s.tracking_number ?? null,
        status: s.status ?? '',
        goods_name: s.goods_name ?? null,
        client_name: s.client_name ?? '',
        client_box_id: s.client_box_id ?? s.clientBoxId ?? '',
        client_id: s.client_id ?? s.clientId ?? 0,
        saldo_pendiente: parseFloat(s.saldo_pendiente ?? s.monto ?? 0),
        client_paid: s.client_paid ?? false,
        has_instructions: s.has_instructions ?? false,
      }));
      setShipments(list);
    } catch (e) {
      console.error('[AdvisorPackages]', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [buildUrl, token]);

  useEffect(() => { load(); }, [load]);

  const openInstrModal = async (item: Shipment) => {
    setInstrShipment(item);
    setInstrModal(true);
    setInstrSelectedId(null);
    setInstrLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/advisor/clients/${item.client_id}/addresses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setInstrAddresses(Array.isArray(data) ? data : []);
    } catch {
      Alert.alert('Error', 'No se pudieron cargar las direcciones');
    } finally {
      setInstrLoading(false);
    }
  };

  const saveInstructions = async () => {
    if (!instrShipment || instrSelectedId === null) return;
    setInstrSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/advisor/shipments/${instrShipment.uid}/instructions`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ addressId: instrSelectedId }),
      });
      if (!res.ok) throw new Error();
      setInstrModal(false);
      Alert.alert('Listo', 'Instrucciones asignadas correctamente');
      load();
    } catch {
      Alert.alert('Error', 'No se pudo asignar la dirección');
    } finally {
      setInstrSaving(false);
    }
  };

  const renderItem = ({ item }: { item: Shipment }) => {
    const statusColor =
      item.status === 'in_transit' ? '#2196F3' :
      item.status === 'delivered' ? '#4CAF50' :
      item.status === 'customs' ? '#FF9800' : '#9E9E9E';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.tracking} numberOfLines={1}>{item.tracking_number || item.uid}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {STATUS_LABELS[item.status] || item.status}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.pencilBtn, { backgroundColor: item.has_instructions ? '#E8F5E9' : '#FFF3E0' }]}
              onPress={() => openInstrModal(item)}
            >
              <Ionicons name="pencil" size={14} color={item.has_instructions ? GREEN : '#FF9800'} />
            </TouchableOpacity>
          </View>
        </View>
        {item.goods_name ? <Text style={styles.goodsName}>{item.goods_name}</Text> : null}
        <View style={styles.cardFooter}>
          <Text style={styles.clientName} numberOfLines={1}>{item.client_name} · {item.client_box_id}</Text>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            {item.saldo_pendiente > 0 && (
              <Text style={styles.saldo}>${item.saldo_pendiente.toFixed(2)}</Text>
            )}
            {item.has_instructions && (
              <View style={styles.instrBadge}>
                <Text style={styles.instrBadgeText}>✓ Instr.</Text>
              </View>
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
        <Ionicons name={config.icon as any} size={20} color="#fff" style={{ marginLeft: 4 }} />
        <Text style={styles.headerTitle}>{config.title}</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{shipments.length}</Text>
        </View>
      </View>

      {/* Payment filter chips */}
      <View style={styles.filtersRow}>
        {(['all', 'paid', 'pending'] as const).map(val => {
          const label = val === 'all' ? 'Todos' : val === 'paid' ? '✅ Pagado' : '🔴 Pendiente';
          const active = paymentFilter === val;
          return (
            <TouchableOpacity
              key={val}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setPaymentFilter(val)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Instructions filter chips */}
      <View style={[styles.filtersRow, { borderTopWidth: 1, borderTopColor: '#f0f0f0' }]}>
        {(['all', 'yes', 'no'] as const).map(val => {
          const label = val === 'all' ? 'Todos' : val === 'yes' ? '✅ Con instrucciones' : '⚠️ Sin instrucciones';
          const active = instructionsFilter === val;
          return (
            <TouchableOpacity
              key={val}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setInstructionsFilter(val)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={shipments}
          keyExtractor={(item) => item.uid || String(item.id)}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[ORANGE]} />}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={<Text style={styles.empty}>No hay envíos en esta categoría.</Text>}
        />
      )}

      {/* ─── Modal: Asignar Instrucciones ─── */}
      <Modal
        visible={instrModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setInstrModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>📍 Asignar Instrucciones</Text>
              <Text style={styles.modalSubtitle} numberOfLines={1}>
                {instrShipment?.uid} · {instrShipment?.client_name}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setInstrModal(false)} style={styles.modalClose}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {instrLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={ORANGE} />
            </View>
          ) : instrAddresses.length === 0 ? (
            <View style={styles.centerContainer}>
              <Ionicons name="location-outline" size={48} color="#ccc" />
              <Text style={{ color: '#666', marginTop: 12, textAlign: 'center', paddingHorizontal: 32 }}>
                Este cliente no tiene direcciones guardadas
              </Text>
            </View>
          ) : (
            <>
              <ScrollView contentContainerStyle={{ padding: 16 }}>
                <Text style={styles.selectLabel}>Selecciona la dirección de entrega:</Text>
                {instrAddresses.map(addr => {
                  const selected = instrSelectedId === addr.id;
                  return (
                    <TouchableOpacity
                      key={addr.id}
                      style={[styles.addrOption, selected && styles.addrOptionSelected]}
                      onPress={() => setInstrSelectedId(addr.id)}
                    >
                      <View style={[styles.radioCircle, selected && styles.radioCircleSelected]}>
                        {selected && <View style={styles.radioInner} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.addrAlias}>{addr.alias || addr.recipient_name || 'Dirección'}</Text>
                        <Text style={styles.addrText}>
                          {addr.street} {addr.exterior_number}
                          {addr.interior_number ? ` Int. ${addr.interior_number}` : ''}
                          {addr.colony ? `, ${addr.colony}` : ''}, {addr.city}, {addr.state} {addr.zip_code}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <View style={{ padding: 16 }}>
                <TouchableOpacity
                  style={[styles.saveBtn, (instrSaving || instrSelectedId === null) && { opacity: 0.5 }]}
                  onPress={saveInstructions}
                  disabled={instrSaving || instrSelectedId === null}
                >
                  {instrSaving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.saveBtnText}>Asignar dirección</Text>
                  }
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: BLACK,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  headerTitle: { color: '#fff', fontWeight: '700', fontSize: 16, marginLeft: 8, flex: 1 },
  countBadge: { backgroundColor: ORANGE, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 2 },
  countText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  filtersRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    flexWrap: 'wrap',
  },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f5f5f5' },
  chipActive: { backgroundColor: ORANGE },
  chipText: { fontSize: 12, color: '#666', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  tracking: { fontWeight: '700', fontSize: 14, color: BLACK, flex: 1, marginRight: 8 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 11, fontWeight: '600' },
  pencilBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  goodsName: { fontSize: 12, color: '#555', marginBottom: 6 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  clientName: { fontSize: 12, color: '#888', flex: 1 },
  saldo: { fontSize: 13, fontWeight: '700', color: '#FF9800' },
  instrBadge: { backgroundColor: '#E8F5E9', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  instrBadgeText: { fontSize: 10, color: '#2E7D32', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 14 },
  // Modal
  modalContainer: { flex: 1, backgroundColor: '#f5f5f5' },
  modalHeader: {
    backgroundColor: ORANGE,
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  modalSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
  modalClose: { padding: 8 },
  selectLabel: { fontSize: 13, color: '#666', marginBottom: 12 },
  addrOption: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 2,
    borderColor: 'transparent',
    elevation: 1,
  },
  addrOptionSelected: { borderColor: ORANGE },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  radioCircleSelected: { borderColor: ORANGE },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: ORANGE },
  addrAlias: { fontSize: 14, fontWeight: '700', color: '#111' },
  addrText: { fontSize: 12, color: '#666', marginTop: 3, lineHeight: 18 },
  saveBtn: { backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
