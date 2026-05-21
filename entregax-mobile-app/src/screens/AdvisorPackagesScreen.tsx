import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, ScrollView, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#111111';
const GREEN = '#4CAF50';

const STATUS_LABELS: Record<string, string> = {
  in_transit: 'En tránsito',
  received_china: 'Recibido China',
  received: 'En bodega',
  received_mty: 'Recibido en MTY',
  customs: 'En aduana',
  ready_pickup: 'Listo para recoger',
  delivered: 'Entregado',
  pending: 'Pendiente',
  reempacado: 'Reempacado',
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
  service_type: string;
  goods_name: string | null;
  client_name: string;
  client_box_id: string;
  client_id: number;
  saldo_pendiente: number;
  client_paid: boolean;
  has_instructions: boolean;
  weight: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  children_count: number;
  is_master: boolean;
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
  carrier_config?: Record<string, string>;
}

const SHIPMENT_TYPE_TO_CARRIER: Record<string, string> = {
  AIR_CHN_MX: 'china_air',
  SEA_CHN_MX: 'china_sea',
  AA_DHL: 'dhl',
  POBOX_USA: 'usa_pobox',
  TDI_EXPRESS: 'tdi_express',
  tdi_express: 'tdi_express',
};

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
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [clientSearch, setClientSearch] = useState('');
  const [instrEnabled, setInstrEnabled] = useState(true);

  // Filter modal
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [tempServiceFilter, setTempServiceFilter] = useState<string>('all');
  const [tempPaymentFilter, setTempPaymentFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [tempInstructionsFilter, setTempInstructionsFilter] = useState<'all' | 'yes' | 'no'>('all');

  // Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [selectionServiceType, setSelectionServiceType] = useState<string | null>(null);

  // Instruction assignment modal
  const [instrModal, setInstrModal] = useState(false);
  const [instrShipment, setInstrShipment] = useState<Shipment | null>(null);
  const [instrAddresses, setInstrAddresses] = useState<ClientAddress[]>([]);
  const [instrLoading, setInstrLoading] = useState(false);
  const [instrSaving, setInstrSaving] = useState(false);
  const [instrSelectedId, setInstrSelectedId] = useState<number | null>(null);
  const [instrCarriers, setInstrCarriers] = useState<any[]>([]);
  const [instrCarrierKey, setInstrCarrierKey] = useState<string>('');
  const [instrCarriersLoading, setInstrCarriersLoading] = useState(false);
  // Bulk selection context for the modal
  const [instrBulkShipments, setInstrBulkShipments] = useState<Shipment[]>([]);

  // Price estimate & COD documents
  const [instrPriceEstimate, setInstrPriceEstimate] = useState<{ price: number; perBox: number; boxes: number; days: string } | null>(null);
  const [instrPriceLoading, setInstrPriceLoading] = useState(false);
  const [instrIsCollect, setInstrIsCollect] = useState(false);
  const [instrFacturaFile, setInstrFacturaFile] = useState<{ uri: string; name: string; mimeType?: string } | null>(null);
  const [instrGuiaFile, setInstrGuiaFile] = useState<{ uri: string; name: string; mimeType?: string } | null>(null);
  const [instrWantsFactura, setInstrWantsFactura] = useState(false);

  const activeFilterCount = [serviceFilter, paymentFilter, instructionsFilter].filter(v => v !== 'all').length;

  const filteredShipments = clientSearch.trim()
    ? shipments.filter(s => {
        const q = clientSearch.toLowerCase();
        return s.client_name.toLowerCase().includes(q) || s.client_box_id.toLowerCase().includes(q);
      })
    : shipments;

  const buildUrl = useCallback(() => {
    let url = `${API_URL}/api/advisor/shipments?page=1&limit=50`;
    if (statusFilter) url += `&filter=${statusFilter}`;
    if (paymentFilter !== 'all') url += `&payment=${paymentFilter}`;
    if (instructionsFilter !== 'all') url += `&instructions=${instructionsFilter}`;
    if (serviceFilter !== 'all') url += `&serviceType=${serviceFilter}`;
    return url;
  }, [statusFilter, paymentFilter, instructionsFilter, serviceFilter]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetch(buildUrl(), { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      const list = (data.shipments || []).map((s: any): Shipment => ({
        uid: s.uid ?? `PKG-${s.id}`,
        id: s.id,
        tracking_number: s.tracking ?? s.tracking_number ?? null,
        status: s.status ?? '',
        service_type: s.serviceType ?? s.service_type ?? '',
        goods_name: s.goods_name ?? s.description ?? null,
        client_name: s.client_name ?? s.clientName ?? '',
        client_box_id: s.client_box_id ?? s.clientBoxId ?? '',
        client_id: s.client_id ?? s.clientId ?? 0,
        saldo_pendiente: parseFloat(s.saldo_pendiente ?? s.monto ?? s.amount ?? 0),
        client_paid: s.client_paid ?? s.clientPaid ?? false,
        has_instructions: s.has_instructions ?? s.hasInstructions ?? false,
        weight: parseFloat(s.weight ?? 0),
        length_cm: parseFloat(s.lengthCm ?? s.length_cm ?? 0),
        width_cm: parseFloat(s.widthCm ?? s.width_cm ?? 0),
        height_cm: parseFloat(s.heightCm ?? s.height_cm ?? 0),
        children_count: parseInt(s.childrenCount ?? s.children_count ?? 0),
        is_master: s.isMaster ?? s.is_master ?? false,
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

  useEffect(() => {
    fetch(`${API_URL}/api/system/payment-status`)
      .then(r => r.json())
      .then(d => setInstrEnabled(d.advisor_instructions_enabled !== false))
      .catch(() => {});
  }, []);

  const openFilterModal = () => {
    setTempServiceFilter(serviceFilter);
    setTempPaymentFilter(paymentFilter);
    setTempInstructionsFilter(instructionsFilter);
    setFilterModalVisible(true);
  };

  const applyFilters = () => {
    setServiceFilter(tempServiceFilter);
    setPaymentFilter(tempPaymentFilter);
    setInstructionsFilter(tempInstructionsFilter);
    setFilterModalVisible(false);
  };

  const clearFilters = () => {
    setTempServiceFilter('all');
    setTempPaymentFilter('all');
    setTempInstructionsFilter('all');
  };

  const handleLongPress = (item: Shipment) => {
    if (selectionMode) return;
    setSelectionMode(true);
    setSelectedUids([item.uid]);
    setSelectionServiceType(item.service_type);
  };

  const handleCardPress = (item: Shipment) => {
    if (!selectionMode) return;
    if (selectedUids.includes(item.uid)) {
      const next = selectedUids.filter(u => u !== item.uid);
      setSelectedUids(next);
      if (next.length === 0) {
        setSelectionMode(false);
        setSelectionServiceType(null);
      }
    } else {
      if (selectionServiceType !== null && item.service_type !== selectionServiceType) {
        Alert.alert('Tipos distintos', 'No puedes combinar diferentes tipos de servicio en la misma selección');
        return;
      }
      setSelectedUids([...selectedUids, item.uid]);
      if (selectionServiceType === null) setSelectionServiceType(item.service_type);
    }
  };

  const cancelSelection = () => {
    setSelectionMode(false);
    setSelectedUids([]);
    setSelectionServiceType(null);
  };

  const fetchPqtxEstimate = async (zipCode: string, shipment: Shipment, bulkCount?: number) => {
    setInstrPriceLoading(true);
    setInstrPriceEstimate(null);
    try {
      const boxes = bulkCount && bulkCount > 1
        ? bulkCount
        : (shipment.is_master && shipment.children_count > 0) ? shipment.children_count + 1 : 1;
      const res = await fetch(`${API_URL}/api/shipping/pqtx-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          destZipCode: zipCode,
          packageCount: boxes,
          weight: shipment.weight || 1,
          length: shipment.length_cm || 30,
          width: shipment.width_cm || 30,
          height: shipment.height_cm || 30,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setInstrPriceEstimate({ price: data.clientPrice, perBox: data.pricePerBox, boxes, days: data.estimatedDays || '2-4 días hábiles' });
      }
    } catch { /* ignore */ }
    finally { setInstrPriceLoading(false); }
  };

  const pickDocument = async (setter: (f: { uri: string; name: string; mimeType?: string } | null) => void) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
      if (!result.canceled && result.assets?.[0]) {
        setter({ uri: result.assets[0].uri, name: result.assets[0].name, mimeType: result.assets[0].mimeType ?? undefined });
      }
    } catch { /* user cancelled */ }
  };

  const handleSelectInstrCarrier = (carrier: any) => {
    const newKey = instrCarrierKey === carrier.carrier_key ? '' : carrier.carrier_key;
    setInstrCarrierKey(newKey);
    setInstrIsCollect(newKey ? (carrier.allows_collect || false) : false);
    setInstrPriceEstimate(null);
    if (newKey === 'paquete_express' && instrShipment) {
      const addr = instrAddresses.find(a => a.id === instrSelectedId);
      const bulkCount = instrBulkShipments.length > 1 ? instrBulkShipments.length : undefined;
      if (addr?.zip_code) fetchPqtxEstimate(addr.zip_code, instrShipment, bulkCount);
    }
  };

  const openInstrModal = async (item: Shipment, bulk: Shipment[] = []) => {
    setInstrShipment(item);
    setInstrBulkShipments(bulk);
    setInstrModal(true);
    setInstrSelectedId(null);
    setInstrCarrierKey('');
    setInstrCarriers([]);
    setInstrIsCollect(false);
    setInstrFacturaFile(null);
    setInstrGuiaFile(null);
    setInstrWantsFactura(false);
    setInstrPriceEstimate(null);
    setInstrLoading(true);
    setInstrCarriersLoading(true);
    const carrierServiceType = SHIPMENT_TYPE_TO_CARRIER[item.service_type] ?? null;
    try {
      const [addrRes, carrierRes] = await Promise.all([
        fetch(`${API_URL}/api/advisor/clients/${item.client_id}/addresses`, { headers: { Authorization: `Bearer ${token}` } }),
        carrierServiceType
          ? fetch(`${API_URL}/api/carrier-options/by-service/${carrierServiceType}`, { headers: { Authorization: `Bearer ${token}` } })
          : Promise.resolve(null),
      ]);
      const addrData = await addrRes.json();
      setInstrAddresses(Array.isArray(addrData) ? addrData : []);
      if (carrierRes) {
        const carrierData = await carrierRes.json();
        setInstrCarriers(carrierData?.data || []);
      }
    } catch {
      Alert.alert('Error', 'No se pudieron cargar los datos');
    } finally {
      setInstrLoading(false);
      setInstrCarriersLoading(false);
    }
  };

  const handleSelectInstrAddress = (addr: ClientAddress) => {
    setInstrSelectedId(addr.id);
    setInstrPriceEstimate(null);
    const serviceKey = instrShipment ? SHIPMENT_TYPE_TO_CARRIER[instrShipment.service_type] : null;
    const preselected = serviceKey && addr.carrier_config?.[serviceKey] ? addr.carrier_config[serviceKey] : '';
    setInstrCarrierKey(preselected);
    const carrier = instrCarriers.find((c: any) => c.carrier_key === preselected);
    setInstrIsCollect(carrier?.allows_collect || false);
    if (preselected === 'paquete_express' && instrShipment && addr.zip_code) {
      const bulkCount = instrBulkShipments.length > 1 ? instrBulkShipments.length : undefined;
      fetchPqtxEstimate(addr.zip_code, instrShipment, bulkCount);
    }
  };

  const saveInstructions = async () => {
    if (!instrShipment || instrSelectedId === null) return;
    if (instrCarriers.length > 0 && !instrCarrierKey) {
      Alert.alert('Paquetería requerida', 'Debes seleccionar una paquetería antes de guardar');
      return;
    }
    setInstrSaving(true);
    try {
      const serviceKey = SHIPMENT_TYPE_TO_CARRIER[instrShipment.service_type];
      const hasFiles = instrFacturaFile || instrGuiaFile;
      let res: Response;
      if (hasFiles || instrIsCollect) {
        const formData = new FormData();
        formData.append('addressId', String(instrSelectedId));
        if (instrCarrierKey && serviceKey) {
          formData.append('carrierKey', instrCarrierKey);
          formData.append('serviceKey', serviceKey);
        }
        formData.append('isCollect', String(instrIsCollect));
        formData.append('wantsFacturaPaqueteria', String(instrWantsFactura));
        if (instrFacturaFile) {
          formData.append('factura', { uri: instrFacturaFile.uri, name: instrFacturaFile.name, type: instrFacturaFile.mimeType || 'application/octet-stream' } as any);
        }
        if (instrGuiaFile) {
          formData.append('guiaExterna', { uri: instrGuiaFile.uri, name: instrGuiaFile.name, type: instrGuiaFile.mimeType || 'application/octet-stream' } as any);
        }
        res = await fetch(`${API_URL}/api/advisor/shipments/${instrShipment.uid}/instructions`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
      } else {
        const body: any = { addressId: instrSelectedId };
        if (instrCarrierKey && serviceKey) { body.carrierKey = instrCarrierKey; body.serviceKey = serviceKey; }
        res = await fetch(`${API_URL}/api/advisor/shipments/${instrShipment.uid}/instructions`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${res.status}`);
      }
      setInstrModal(false);
      Alert.alert('Listo', 'Instrucciones asignadas correctamente');
      cancelSelection();
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo asignar la dirección');
    } finally {
      setInstrSaving(false);
    }
  };

  const renderItem = ({ item }: { item: Shipment }) => {
    const statusColor =
      item.status === 'in_transit' ? '#2196F3' :
      item.status === 'delivered' ? '#4CAF50' :
      item.status === 'customs' ? '#FF9800' : '#9E9E9E';
    const isSelected = selectedUids.includes(item.uid);

    return (
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() => handleCardPress(item)}
        onLongPress={() => handleLongPress(item)}
        style={[styles.card, isSelected && styles.cardSelected]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {selectionMode && (
            <View style={styles.checkboxArea}>
              <Ionicons
                name={isSelected ? 'checkbox' : 'square-outline'}
                size={24}
                color={isSelected ? ORANGE : '#bbb'}
              />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <View style={styles.cardHeader}>
              <Text style={styles.tracking} numberOfLines={1}>{item.tracking_number || item.uid}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                  <Text style={[styles.statusText, { color: statusColor }]}>
                    {STATUS_LABELS[item.status] || item.status}
                  </Text>
                </View>
                {instrEnabled && !selectionMode && (
                  <TouchableOpacity
                    style={[styles.pencilBtn, { backgroundColor: item.has_instructions ? '#E8F5E9' : '#FFF3E0' }]}
                    onPress={() => openInstrModal(item)}
                  >
                    <Ionicons name="pencil" size={14} color={item.has_instructions ? GREEN : '#FF9800'} />
                  </TouchableOpacity>
                )}
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
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ─── Header ─── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 8 }}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Ionicons name={config.icon as any} size={20} color="#fff" style={{ marginLeft: 4 }} />
        <Text style={styles.headerTitle}>{config.title}</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{shipments.length}</Text>
        </View>
        {/* Select mode toggle */}
        {!selectionMode ? (
          <TouchableOpacity onPress={() => setSelectionMode(true)} style={{ padding: 8, marginLeft: 4 }}>
            <Ionicons name="checkmark-done-outline" size={22} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={cancelSelection} style={{ padding: 8, marginLeft: 4 }}>
            <Ionicons name="close-circle-outline" size={22} color="#fff" />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={openFilterModal} style={styles.filterBtn}>
          <Ionicons name="options-outline" size={20} color="#fff" />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Active filters summary */}
      {activeFilterCount > 0 && (
        <View style={styles.activeFilterBar}>
          <Ionicons name="funnel" size={12} color={ORANGE} />
          <Text style={styles.activeFilterText} numberOfLines={1}>
            {[
              serviceFilter !== 'all' && serviceFilter,
              paymentFilter === 'paid' && 'Pagado',
              paymentFilter === 'pending' && 'Pendiente',
              instructionsFilter === 'yes' && 'Con instrucciones',
              instructionsFilter === 'no' && 'Sin instrucciones',
            ].filter(Boolean).join(' · ')}
          </Text>
          <TouchableOpacity onPress={() => { setServiceFilter('all'); setPaymentFilter('all'); setInstructionsFilter('all'); }}>
            <Ionicons name="close-circle" size={14} color="#999" />
          </TouchableOpacity>
        </View>
      )}

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color="#999" style={{ marginRight: 6 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por cliente o ID..."
          placeholderTextColor="#bbb"
          value={clientSearch}
          onChangeText={setClientSearch}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        {clientSearch.length > 0 && (
          <TouchableOpacity onPress={() => setClientSearch('')}>
            <Ionicons name="close-circle" size={16} color="#bbb" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filteredShipments}
          keyExtractor={(item) => item.uid || String(item.id)}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[ORANGE]} />}
          contentContainerStyle={{ padding: 12, paddingBottom: selectionMode ? 90 : 12 }}
          ListEmptyComponent={<Text style={styles.empty}>No hay envíos en esta categoría.</Text>}
        />
      )}

      {/* ─── Selection action bar ─── */}
      {selectionMode && (
        <View style={styles.selectionBar}>
          <TouchableOpacity onPress={cancelSelection} style={styles.selectionCancelBtn}>
            <Ionicons name="close" size={18} color="#666" />
            <Text style={styles.selectionCancelText}>Cancelar</Text>
          </TouchableOpacity>
          <Text style={styles.selectionCount}>
            {selectedUids.length} seleccionado{selectedUids.length !== 1 ? 's' : ''}
          </Text>
          {instrEnabled && selectedUids.length > 0 && (
            <TouchableOpacity
              style={styles.selectionActionBtn}
              onPress={() => {
                const bulk = shipments.filter(s => selectedUids.includes(s.uid));
                const first = bulk[0];
                if (first) openInstrModal(first, bulk);
              }}
            >
              <Ionicons name="pencil-outline" size={14} color="#fff" style={{ marginRight: 4 }} />
              <Text style={styles.selectionActionText}>Asignar instrucciones</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ─── Filter Modal ─── */}
      <Modal
        visible={filterModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={styles.filterOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setFilterModalVisible(false)} />
          <View style={styles.filterSheet}>
            <View style={styles.filterHandle} />
            <View style={styles.filterSheetHeader}>
              <Text style={styles.filterSheetTitle}>Filtros</Text>
              {(tempServiceFilter !== 'all' || tempPaymentFilter !== 'all' || tempInstructionsFilter !== 'all') && (
                <TouchableOpacity onPress={clearFilters}>
                  <Text style={styles.filterClearText}>Limpiar</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Service type */}
            <Text style={styles.filterSectionTitle}>Tipo de servicio</Text>
            <View style={styles.filterChipsWrap}>
              {([
                { key: 'all',         label: 'Todos' },
                { key: 'AIR_CHN_MX',  label: '✈️ Aéreo China' },
                { key: 'SEA_CHN_MX',  label: '🚢 Marítimo' },
                { key: 'AA_DHL',      label: '📦 DHL MTY' },
                { key: 'POBOX_USA',   label: '📮 PO Box USA' },
                { key: 'TDI_EXPRESS', label: '🚚 TDI Express' },
              ] as const).map(s => {
                const active = tempServiceFilter === s.key;
                return (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setTempServiceFilter(s.key)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Payment */}
            <Text style={styles.filterSectionTitle}>Pago</Text>
            <View style={styles.filterChipsWrap}>
              {([
                { key: 'all', label: 'Todos' },
                { key: 'paid', label: '✅ Pagado' },
                { key: 'pending', label: '🔴 Pendiente' },
              ] as const).map(s => {
                const active = tempPaymentFilter === s.key;
                return (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setTempPaymentFilter(s.key)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Instructions */}
            <Text style={styles.filterSectionTitle}>Instrucciones</Text>
            <View style={styles.filterChipsWrap}>
              {([
                { key: 'all', label: 'Todos' },
                { key: 'yes', label: '✅ Con instrucciones' },
                { key: 'no',  label: '⚠️ Sin instrucciones' },
              ] as const).map(s => {
                const active = tempInstructionsFilter === s.key;
                return (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setTempInstructionsFilter(s.key)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.filterApplyBtn} onPress={applyFilters}>
              <Text style={styles.filterApplyText}>Aplicar filtros</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── Modal: Asignar Instrucciones ─── */}
      <Modal visible={instrModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setInstrModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>📍 Asignar Instrucciones</Text>
              {instrBulkShipments.length > 1 ? (
                <>
                  <Text style={styles.modalSubtitle}>
                    {instrBulkShipments.length} cajas · {instrShipment?.client_name}
                  </Text>
                  <Text style={[styles.modalSubtitle, { fontSize: 11, marginTop: 2 }]} numberOfLines={2}>
                    {instrBulkShipments.map(s => s.tracking_number || s.uid).join(' · ')}
                  </Text>
                </>
              ) : (
                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  {instrShipment?.tracking_number || instrShipment?.uid} · {instrShipment?.client_name}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => setInstrModal(false)} style={styles.modalClose}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {instrLoading ? (
            <View style={styles.centerContainer}><ActivityIndicator size="large" color={ORANGE} /></View>
          ) : instrAddresses.length === 0 ? (
            <View style={styles.centerContainer}>
              <Ionicons name="location-outline" size={48} color="#ccc" />
              <Text style={{ color: '#666', marginTop: 12, textAlign: 'center', paddingHorizontal: 32 }}>
                Este cliente no tiene direcciones guardadas
              </Text>
            </View>
          ) : (
            <>
              <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>

                {/* ── Detalles del embarque ── */}
                {instrShipment && (instrShipment.weight > 0 || instrShipment.children_count > 0 || instrShipment.goods_name || instrBulkShipments.length > 1) && (
                  <View style={{ backgroundColor: '#F8F8F8', borderRadius: 10, padding: 12, borderLeftWidth: 3, borderLeftColor: ORANGE }}>
                    <Text style={{ fontWeight: '700', fontSize: 13, color: '#333', marginBottom: 6 }}>📦 Detalles del embarque</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                      {instrBulkShipments.length > 1 ? (
                        <View style={styles.detailChip}>
                          <Text style={styles.detailChipLabel}>Cajas</Text>
                          <Text style={styles.detailChipValue}>{instrBulkShipments.length}</Text>
                        </View>
                      ) : instrShipment.is_master && instrShipment.children_count > 0 ? (
                        <View style={styles.detailChip}>
                          <Text style={styles.detailChipLabel}>Cajas</Text>
                          <Text style={styles.detailChipValue}>{instrShipment.children_count + 1}</Text>
                        </View>
                      ) : null}
                      {instrShipment.weight > 0 && (
                        <View style={styles.detailChip}>
                          <Text style={styles.detailChipLabel}>Peso</Text>
                          <Text style={styles.detailChipValue}>{instrShipment.weight.toFixed(2)} kg</Text>
                        </View>
                      )}
                      {instrShipment.length_cm > 0 && instrShipment.width_cm > 0 && instrShipment.height_cm > 0 && (
                        <>
                          <View style={styles.detailChip}>
                            <Text style={styles.detailChipLabel}>Medidas</Text>
                            <Text style={styles.detailChipValue}>{instrShipment.length_cm}×{instrShipment.width_cm}×{instrShipment.height_cm} cm</Text>
                          </View>
                          <View style={styles.detailChip}>
                            <Text style={styles.detailChipLabel}>Vol. m³</Text>
                            <Text style={styles.detailChipValue}>
                              {((instrShipment.length_cm * instrShipment.width_cm * instrShipment.height_cm) / 1_000_000).toFixed(4)}
                            </Text>
                          </View>
                        </>
                      )}
                      {instrShipment.goods_name && (
                        <View style={[styles.detailChip, { flex: 1, minWidth: '100%' }]}>
                          <Text style={styles.detailChipLabel}>Mercancía</Text>
                          <Text style={styles.detailChipValue} numberOfLines={1}>{instrShipment.goods_name}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {/* ── Direcciones ── */}
                <Text style={styles.selectLabel}>Selecciona la dirección de entrega:</Text>
                {instrAddresses.map(addr => {
                  const selected = instrSelectedId === addr.id;
                  return (
                    <TouchableOpacity key={addr.id} style={[styles.addrOption, selected && styles.addrOptionSelected]} onPress={() => handleSelectInstrAddress(addr)}>
                      <View style={[styles.radioCircle, selected && styles.radioCircleSelected]}>
                        {selected && <View style={styles.radioInner} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.addrAlias}>
                          {addr.alias || addr.recipient_name || 'Dirección'}
                          {addr.is_default ? '  ✓ Principal' : ''}
                        </Text>
                        {addr.recipient_name && addr.alias && (
                          <Text style={{ fontSize: 12, color: '#888' }}>Recibe: {addr.recipient_name}</Text>
                        )}
                        <Text style={styles.addrText}>
                          {addr.street} {addr.exterior_number}{addr.interior_number ? ` Int. ${addr.interior_number}` : ''}
                          {addr.colony ? `, ${addr.colony}` : ''}, {addr.city}, {addr.state} {addr.zip_code}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {/* ── Paquetería ── */}
                {(instrCarriersLoading || instrCarriers.length > 0) && (
                  <View style={{ marginTop: 4 }}>
                    <View style={{ borderTopWidth: 1, borderTopColor: '#eee', marginBottom: 12 }} />
                    <Text style={{ fontWeight: '700', fontSize: 14, color: ORANGE, marginBottom: 10 }}>🚚 ¿Por qué paquetería?</Text>
                    {instrCarriersLoading ? (
                      <ActivityIndicator size="small" color={ORANGE} />
                    ) : (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                        {instrCarriers.map((carrier: any) => {
                          const isSelected = instrCarrierKey === carrier.carrier_key;
                          const isUrl = carrier.icon && (carrier.icon.startsWith('/') || carrier.icon.startsWith('http'));
                          return (
                            <TouchableOpacity
                              key={carrier.carrier_key}
                              onPress={() => handleSelectInstrCarrier(carrier)}
                              style={{
                                width: 100, padding: 10, borderRadius: 10, alignItems: 'center', gap: 4,
                                borderWidth: isSelected ? 2 : 1,
                                borderColor: isSelected ? ORANGE : '#ddd',
                                backgroundColor: isSelected ? '#FFF3E0' : '#fff',
                              }}
                            >
                              {isSelected && (
                                <Ionicons name="checkmark-circle" size={14} color={ORANGE} style={{ position: 'absolute', top: 6, right: 6 }} />
                              )}
                              {isUrl
                                ? <Text style={{ fontSize: 28 }}>📦</Text>
                                : <Text style={{ fontSize: 28 }}>{carrier.icon || '📦'}</Text>
                              }
                              <Text style={{ fontSize: 11, fontWeight: isSelected ? '700' : '400', textAlign: 'center', color: '#333' }} numberOfLines={2}>
                                {carrier.name}
                              </Text>
                              {carrier.price_label && (
                                <Text style={{ fontSize: 10, color: carrier.price_label === 'GRATIS' ? '#4CAF50' : carrier.allows_collect ? '#FF9800' : '#666', fontWeight: carrier.allows_collect ? '700' : '600', textAlign: 'center' }}>
                                  {carrier.price_label}
                                </Text>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}

                    {/* ── Estimado de costo (Paquete Express) ── */}
                    {instrCarrierKey === 'paquete_express' && (instrPriceLoading || instrPriceEstimate) && (
                      <View style={{ marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        {instrPriceLoading ? (
                          <>
                            <ActivityIndicator size="small" color="#1D4ED8" />
                            <Text style={{ fontSize: 13, color: '#555' }}>Calculando costo estimado…</Text>
                          </>
                        ) : instrPriceEstimate ? (
                          <>
                            <Text style={{ fontSize: 20 }}>💰</Text>
                            <View>
                              <Text style={{ fontSize: 14, fontWeight: '700', color: '#1D4ED8' }}>
                                Estimado: ${instrPriceEstimate.price.toFixed(2)} MXN
                              </Text>
                              {instrPriceEstimate.boxes > 1 && (
                                <Text style={{ fontSize: 11, color: '#666' }}>${instrPriceEstimate.perBox.toFixed(2)}/caja × {instrPriceEstimate.boxes} cajas</Text>
                              )}
                              <Text style={{ fontSize: 11, color: '#888' }}>{instrPriceEstimate.days}</Text>
                            </View>
                          </>
                        ) : null}
                      </View>
                    )}

                    {/* ── Documentos para paquetería por cobrar ── */}
                    {instrIsCollect && (
                      <View style={{ marginTop: 14, padding: 14, borderRadius: 10, backgroundColor: '#FFFDE7', borderWidth: 1, borderColor: '#FFB74D' }}>
                        <Text style={{ fontWeight: '700', fontSize: 13, color: ORANGE, marginBottom: 12 }}>📄 Documentos requeridos</Text>

                        {/* Factura */}
                        <Text style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Factura del embarque</Text>
                        <TouchableOpacity
                          style={[styles.docPickerBtn, instrFacturaFile && styles.docPickerBtnDone]}
                          onPress={() => pickDocument(setInstrFacturaFile)}
                        >
                          <Ionicons name="attach-outline" size={16} color={instrFacturaFile ? '#2E7D32' : '#888'} />
                          <Text style={{ fontSize: 12, color: instrFacturaFile ? '#2E7D32' : '#888', flex: 1 }} numberOfLines={1}>
                            {instrFacturaFile ? `✓ ${instrFacturaFile.name}` : 'Subir factura (PDF o imagen)'}
                          </Text>
                        </TouchableOpacity>

                        {/* ¿Requiere factura de paquetería? */}
                        <Text style={{ fontSize: 12, color: '#666', marginTop: 12, marginBottom: 6 }}>¿Requiere factura de la paquetería?</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity style={[styles.yesNoBtn, instrWantsFactura && styles.yesNoBtnActive]} onPress={() => setInstrWantsFactura(true)}>
                            <Text style={[styles.yesNoBtnText, instrWantsFactura && { color: '#fff' }]}>Sí</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.yesNoBtn, !instrWantsFactura && { backgroundColor: '#666', borderColor: '#666' }]} onPress={() => setInstrWantsFactura(false)}>
                            <Text style={[styles.yesNoBtnText, !instrWantsFactura && { color: '#fff' }]}>No</Text>
                          </TouchableOpacity>
                        </View>

                        {/* Guía externa */}
                        <Text style={{ fontSize: 12, color: '#666', marginTop: 12, marginBottom: 6 }}>Guía de paquetería (opcional)</Text>
                        <TouchableOpacity
                          style={[styles.docPickerBtn, instrGuiaFile && styles.docPickerBtnDone]}
                          onPress={() => pickDocument(setInstrGuiaFile)}
                        >
                          <Ionicons name="attach-outline" size={16} color={instrGuiaFile ? '#2E7D32' : '#888'} />
                          <Text style={{ fontSize: 12, color: instrGuiaFile ? '#2E7D32' : '#888', flex: 1 }} numberOfLines={1}>
                            {instrGuiaFile ? `✓ ${instrGuiaFile.name}` : 'Subir guía (PDF o imagen)'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </ScrollView>

              <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#f0f0f0' }}>
                <TouchableOpacity
                  style={[styles.saveBtn, (instrSaving || instrSelectedId === null || (instrCarriers.length > 0 && !instrCarrierKey)) && { opacity: 0.5 }]}
                  onPress={saveInstructions}
                  disabled={instrSaving || instrSelectedId === null || (instrCarriers.length > 0 && !instrCarrierKey)}
                >
                  {instrSaving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.saveBtnText}>
                        {instrCarriers.length > 0 && !instrCarrierKey ? 'Selecciona paquetería' : 'Asignar instrucciones'}
                      </Text>
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
  filterBtn: { marginLeft: 10, padding: 6, position: 'relative' },
  filterBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: ORANGE,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: BLACK,
  },
  filterBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  activeFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#FFE0B2',
  },
  activeFilterText: { flex: 1, fontSize: 12, color: '#BF360C', fontWeight: '500' },
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
  cardSelected: {
    borderWidth: 2,
    borderColor: ORANGE,
    backgroundColor: '#FFF8F5',
  },
  selectionCircle: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 1,
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
  // Selection bar
  selectionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    gap: 10,
  },
  selectionCancelBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 8 },
  selectionCancelText: { fontSize: 13, color: '#666' },
  selectionCount: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '700', color: BLACK },
  selectionActionBtn: {
    backgroundColor: ORANGE,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectionActionText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  // Filter modal
  filterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  filterSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
  },
  filterHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#ddd',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  filterSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  filterSheetTitle: { fontSize: 17, fontWeight: '700', color: BLACK },
  filterClearText: { fontSize: 14, color: ORANGE, fontWeight: '600' },
  filterSectionTitle: { fontSize: 12, color: '#888', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 },
  filterChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  filterApplyBtn: {
    backgroundColor: BLACK,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  filterApplyText: { color: '#fff', fontWeight: '700', fontSize: 15 },
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
  detailChip: { backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#e0e0e0', minWidth: 70 },
  detailChipLabel: { fontSize: 10, color: '#888', fontWeight: '600', textTransform: 'uppercase' as const },
  detailChipValue: { fontSize: 13, color: '#222', fontWeight: '700', marginTop: 1 },
  checkboxArea: { paddingRight: 10, paddingLeft: 2, justifyContent: 'center' },
  docPickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff' },
  docPickerBtnDone: { borderColor: '#4CAF50', backgroundColor: '#F1F8F1' },
  yesNoBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: ORANGE },
  yesNoBtnActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  yesNoBtnText: { fontSize: 13, fontWeight: '600', color: ORANGE },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', marginHorizontal: 12, marginVertical: 8,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#E8E8E8',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111', padding: 0 },
});
