// ============================================
// ADVISOR CLIENTS SCREEN
// Lista de clientes del asesor + gestión de direcciones
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, FlatList, StyleSheet, RefreshControl, TouchableOpacity,
  TextInput, Linking, Modal, ScrollView, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Avatar, Chip, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const PURPLE = '#7B1FA2';

const SERVICE_LIST = [
  { value: 'air',         label: '✈️ Aéreo China',   color: '#2196F3' },
  { value: 'maritime',   label: '🚢 Marítimo China', color: '#00897B' },
  { value: 'tdi_express',label: '✈️ TDI Express',    color: '#7B1FA2' },
  { value: 'dhl',        label: '📮 Liberación MTY', color: '#D32F2F' },
  { value: 'usa',        label: '📦 PO Box USA',     color: '#F05A28' },
];

interface Client {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  box_id: string;
  is_verified: boolean;
  verification_status: string;
  created_at: string;
  last_shipment_at: string | null;
  total_packages: number;
  in_transit_count: number;
  pending_payment_count: number;
  total_pending: number;
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
  default_for_service: string | null;
}

export default function AdvisorClientsScreen({ navigation, route }: any) {
  const { user, token, filter: initialFilter } = route.params;
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>(initialFilter || 'all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const [instrEnabled, setInstrEnabled] = useState(true);

  // Address management modal
  const [addrModal, setAddrModal] = useState(false);
  const [addrClient, setAddrClient] = useState<Client | null>(null);
  const [addrList, setAddrList] = useState<ClientAddress[]>([]);
  const [addrLoading, setAddrLoading] = useState(false);
  const [editingAddrId, setEditingAddrId] = useState<number | null>(null);
  const [editingServices, setEditingServices] = useState<string[]>([]);
  const [addrSaving, setAddrSaving] = useState(false);

  const loadClients = useCallback(async (reset = false) => {
    try {
      const currentPage = reset ? 1 : page;
      let url = `${API_URL}/api/advisor/clients?page=${currentPage}&limit=20`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (filter !== 'all') url += `&status=${filter}`;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const normalize = (c: any): Client => ({
        id: c.id,
        full_name: c.full_name ?? c.fullName ?? '',
        email: c.email ?? '',
        phone: c.phone ?? '',
        box_id: c.box_id ?? c.boxId ?? '',
        is_verified: c.is_verified ?? c.identityVerified ?? false,
        verification_status: c.verification_status ?? c.verificationStatus ?? '',
        created_at: c.created_at ?? c.createdAt ?? '',
        last_shipment_at: c.last_shipment_at ?? c.lastShipmentAt ?? null,
        total_packages: c.total_packages ?? c.totalPackages ?? 0,
        in_transit_count: c.in_transit_count ?? c.inTransitCount ?? 0,
        pending_payment_count: c.pending_payment_count ?? c.pendingPaymentCount ?? 0,
        total_pending: c.total_pending ?? c.pendingPaymentTotal ?? 0,
      });
      const list: Client[] = (data.clients || []).map(normalize);
      if (reset) setClients(list); else setClients(prev => [...prev, ...list]);
      setHasMore((data.clients || []).length === 20);
      if (reset) setPage(1);
    } catch (err) {
      console.error('Error loading clients:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, search, filter, page]);

  useEffect(() => { setLoading(true); loadClients(true); }, [search, filter]);

  useEffect(() => {
    fetch(`${API_URL}/api/system/payment-status`)
      .then(r => r.json())
      .then(d => setInstrEnabled(d.advisor_instructions_enabled !== false))
      .catch(() => {});
  }, []);

  const onRefresh = () => { setRefreshing(true); setPage(1); loadClients(true); };
  const loadMore = () => { if (!loading && hasMore) { setPage(prev => prev + 1); loadClients(); } };

  // ─── Address Management ───
  const openAddressModal = async (client: Client) => {
    setAddrClient(client);
    setAddrModal(true);
    setEditingAddrId(null);
    setAddrLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/advisor/clients/${client.id}/addresses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setAddrList(Array.isArray(data) ? data : []);
    } catch {
      Alert.alert('Error', 'No se pudieron cargar las direcciones');
    } finally {
      setAddrLoading(false);
    }
  };

  const startEditAddress = (addr: ClientAddress) => {
    setEditingAddrId(addr.id);
    const services = addr.default_for_service
      ? addr.default_for_service.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    setEditingServices(services);
  };

  const toggleService = (value: string) => {
    setEditingServices(prev =>
      prev.includes(value) ? prev.filter(s => s !== value) : [...prev, value]
    );
  };

  const saveAddressServices = async () => {
    if (!addrClient || editingAddrId === null) return;
    setAddrSaving(true);
    try {
      const res = await fetch(
        `${API_URL}/api/advisor/clients/${addrClient.id}/addresses/${editingAddrId}/default-for-service`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ services: editingServices }),
        }
      );
      if (!res.ok) throw new Error();
      // Refresh addresses
      const r2 = await fetch(`${API_URL}/api/advisor/clients/${addrClient.id}/addresses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r2.json();
      setAddrList(Array.isArray(data) ? data : []);
      setEditingAddrId(null);
      Alert.alert('Listo', 'Preferencias actualizadas');
    } catch {
      Alert.alert('Error', 'No se pudo guardar');
    } finally {
      setAddrSaving(false);
    }
  };

  const renderClient = ({ item }: { item: Client }) => {
    const daysAgo = item.last_shipment_at
      ? Math.floor((Date.now() - new Date(item.last_shipment_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    return (
      <View style={styles.clientCard}>
        <View style={styles.clientHeader}>
          <Avatar.Text
            size={44}
            label={(item.full_name || 'NN').substring(0, 2).toUpperCase()}
            style={{ backgroundColor: item.is_verified ? ORANGE : '#9E9E9E' }}
          />
          <View style={styles.clientInfo}>
            <Text style={styles.clientName}>{item.full_name || 'Sin nombre'}</Text>
            <Text style={styles.clientBox}>{item.box_id || 'Sin casillero'}</Text>
          </View>
          {item.is_verified
            ? <Chip icon="check-circle" mode="flat" compact textStyle={{ fontSize: 10, color: '#4CAF50', marginVertical: 0, marginHorizontal: 2 }} style={{ backgroundColor: '#E8F5E9', alignSelf: 'flex-start' }}>Verificado</Chip>
            : <Chip icon="clock" mode="flat" compact textStyle={{ fontSize: 10, color: '#FF9800', marginVertical: 0, marginHorizontal: 2 }} style={{ backgroundColor: '#FFF3E0', alignSelf: 'flex-start' }}>Pendiente</Chip>
          }
        </View>

        <View style={styles.clientStats}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{item.total_packages}</Text>
            <Text style={styles.statLabel}>Envíos</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: '#2196F3' }]}>{item.in_transit_count}</Text>
            <Text style={styles.statLabel}>En Tránsito</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: item.pending_payment_count > 0 ? '#FF9800' : '#4CAF50' }]}>
              {item.pending_payment_count}
            </Text>
            <Text style={styles.statLabel}>Por Pagar</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>
              {daysAgo !== null ? (daysAgo === 0 ? 'Hoy' : `Hace ${daysAgo}d`) : 'Sin envíos'}
            </Text>
            <Text style={[styles.statLabel, { fontSize: 10 }]}>Último envío</Text>
          </View>
        </View>

        <View style={styles.clientActions}>
          <TouchableOpacity style={styles.actionButton} onPress={() => item.phone && Linking.openURL(`tel:${item.phone}`)}>
            <Ionicons name="call-outline" size={20} color={ORANGE} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => {
            const clean = item.phone?.replace(/\D/g, '');
            const msg = encodeURIComponent(`Hola ${item.full_name.split(' ')[0]}, soy tu asesor de EntregaX. ¿En qué puedo ayudarte?`);
            if (clean) Linking.openURL(`https://wa.me/${clean}?text=${msg}`);
          }}>
            <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => Linking.openURL(`mailto:${item.email}`)}>
            <Ionicons name="mail-outline" size={20} color="#2196F3" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#f3e5f5' }]} onPress={() => openAddressModal(item)}>
            <Ionicons name="location-outline" size={20} color={PURPLE} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const filters = [
    { key: 'all', label: 'Todos' },
    { key: 'verified', label: 'Verificados' },
    { key: 'pending', label: 'Pendientes' },
  ];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mis Clientes</Text>
        <Text style={styles.clientCount}>{clients.length} clientes</Text>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={20} color="#666" />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nombre, email o casillero..."
            value={search}
            onChangeText={setSearch}
            placeholderTextColor="#999"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={20} color="#666" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.filtersContainer}>
        {filters.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && clients.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={ORANGE} />
        </View>
      ) : (
        <FlatList
          data={clients}
          renderItem={renderClient}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ORANGE]} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No tienes clientes aún</Text>
              <Text style={styles.emptySubtext}>Comparte tu código de referido para ganar comisiones</Text>
            </View>
          }
        />
      )}

      {/* ─── Modal: Gestión de Direcciones ─── */}
      <Modal visible={addrModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAddrModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>📍 Direcciones</Text>
              <Text style={styles.modalSubtitle}>{addrClient?.full_name}</Text>
            </View>
            <TouchableOpacity onPress={() => setAddrModal(false)} style={styles.modalClose}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {addrLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={PURPLE} />
            </View>
          ) : addrList.length === 0 ? (
            <View style={styles.centerContainer}>
              <Ionicons name="location-outline" size={48} color="#ccc" />
              <Text style={{ color: '#666', marginTop: 12, textAlign: 'center', paddingHorizontal: 32 }}>
                Este cliente no tiene direcciones guardadas
              </Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {addrList.map(addr => {
                const isEditing = editingAddrId === addr.id;
                const services = addr.default_for_service
                  ? addr.default_for_service.split(',').map(s => s.trim()).filter(Boolean)
                  : [];
                return (
                  <View key={addr.id} style={styles.addrCard}>
                    <View style={styles.addrCardHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.addrAlias}>{addr.alias || addr.recipient_name || 'Dirección'}</Text>
                          {addr.is_default && (
                            <View style={styles.defaultBadge}>
                              <Text style={styles.defaultBadgeText}>Principal</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.addrText}>
                          {addr.street} {addr.exterior_number}{addr.interior_number ? ` Int. ${addr.interior_number}` : ''}
                          {addr.colony ? `, ${addr.colony}` : ''}, {addr.city}, {addr.state} {addr.zip_code}
                        </Text>
                        {services.length > 0 && !isEditing && (
                          <View style={styles.serviceChips}>
                            {services.map(svc => {
                              const found = SERVICE_LIST.find(s => s.value === svc);
                              return (
                                <View key={svc} style={[styles.svcChip, { backgroundColor: (found?.color || '#666') + '22' }]}>
                                  <Text style={[styles.svcChipText, { color: found?.color || '#666' }]}>
                                    {found?.label || svc}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                      {instrEnabled && (
                        <TouchableOpacity
                          style={[styles.editBtn, isEditing && { backgroundColor: '#7B1FA2' }]}
                          onPress={() => isEditing ? setEditingAddrId(null) : startEditAddress(addr)}
                        >
                          <Ionicons name={isEditing ? 'close' : 'pencil'} size={16} color={isEditing ? '#fff' : PURPLE} />
                        </TouchableOpacity>
                      )}
                    </View>

                    {isEditing && (
                      <View style={styles.editPanel}>
                        <Text style={styles.editPanelTitle}>Servicios predeterminados:</Text>
                        {SERVICE_LIST.map(svc => {
                          const checked = editingServices.includes(svc.value);
                          return (
                            <TouchableOpacity
                              key={svc.value}
                              style={[styles.svcRow, checked && { backgroundColor: svc.color + '15' }]}
                              onPress={() => toggleService(svc.value)}
                            >
                              <View style={[styles.checkbox, checked && { backgroundColor: svc.color, borderColor: svc.color }]}>
                                {checked && <Ionicons name="checkmark" size={12} color="#fff" />}
                              </View>
                              <Text style={[styles.svcRowText, checked && { color: svc.color, fontWeight: '600' }]}>
                                {svc.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                        <TouchableOpacity
                          style={[styles.saveBtn, addrSaving && { opacity: 0.6 }]}
                          onPress={saveAddressServices}
                          disabled={addrSaving}
                        >
                          {addrSaving
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Text style={styles.saveBtnText}>Guardar preferencias</Text>
                          }
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#111', paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backButton: { padding: 8, marginRight: 8 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700', flex: 1 },
  clientCount: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  searchContainer: { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12 },
  searchInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 15, color: '#333' },
  filtersContainer: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f5f5f5' },
  filterChipActive: { backgroundColor: ORANGE },
  filterText: { fontSize: 13, color: '#666', fontWeight: '500' },
  filterTextActive: { color: '#fff' },
  listContent: { padding: 16 },
  clientCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 1 },
  clientHeader: { flexDirection: 'row', alignItems: 'center' },
  clientInfo: { flex: 1, marginLeft: 12 },
  clientName: { fontSize: 16, fontWeight: '600', color: '#111' },
  clientBox: { fontSize: 13, color: '#666', marginTop: 2 },
  clientStats: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  statItem: { alignItems: 'center' },
  statNumber: { fontSize: 18, fontWeight: '700', color: '#111' },
  statLabel: { fontSize: 11, color: '#666', marginTop: 2 },
  clientActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, gap: 8 },
  actionButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#666', marginTop: 12 },
  emptySubtext: { fontSize: 13, color: '#999', marginTop: 4, textAlign: 'center', paddingHorizontal: 40 },
  // Modal styles
  modalContainer: { flex: 1, backgroundColor: '#f5f5f5' },
  modalHeader: { backgroundColor: PURPLE, paddingTop: 20, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  modalSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 },
  modalClose: { padding: 8 },
  // Address card styles
  addrCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, elevation: 1 },
  addrCardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  addrAlias: { fontSize: 15, fontWeight: '700', color: '#111' },
  addrText: { fontSize: 12, color: '#666', marginTop: 3, lineHeight: 18 },
  defaultBadge: { backgroundColor: '#E8F5E9', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  defaultBadgeText: { fontSize: 10, color: '#2E7D32', fontWeight: '600' },
  serviceChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  svcChip: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  svcChipText: { fontSize: 10, fontWeight: '600' },
  editBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f3e5f5', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  editPanel: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  editPanelTitle: { fontSize: 13, fontWeight: '600', color: PURPLE, marginBottom: 8 },
  svcRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 6, borderRadius: 8, marginBottom: 4 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  svcRowText: { fontSize: 14, color: '#333' },
  saveBtn: { backgroundColor: PURPLE, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
