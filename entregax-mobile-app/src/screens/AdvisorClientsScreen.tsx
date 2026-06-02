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
  const { user, token, filter: initialFilter, subAdvisorId, subAdvisorName } = route.params;
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

  // New address form
  const [showNewAddrForm, setShowNewAddrForm] = useState(false);
  const emptyNewAddr = { alias: '', recipientName: '', countryCode: '+52', phone: '', zipCode: '', neighborhood: '', city: '', state: '', street: '', exteriorNumber: '', interiorNumber: '', receptionHours: '', notes: '', isDefault: false };
  const [newAddr, setNewAddr] = useState(emptyNewAddr);
  const [newAddrSaving, setNewAddrSaving] = useState(false);
  const [zipLoading, setZipLoading] = useState(false);
  const [colonyOptions, setColonyOptions] = useState<string[]>([]);
  const [showColonyPicker, setShowColonyPicker] = useState(false);
  const [showLadaPicker, setShowLadaPicker] = useState(false);
  const LADAS = [
    { code: '+52', flag: '🇲🇽', label: '+52 México' },
    { code: '+1',  flag: '🇺🇸', label: '+1 EE.UU.' },
    { code: '+86', flag: '🇨🇳', label: '+86 China' },
    { code: '+57', flag: '🇨🇴', label: '+57 Colombia' },
    { code: '+34', flag: '🇪🇸', label: '+34 España' },
    { code: '+44', flag: '🇬🇧', label: '+44 Reino Unido' },
    { code: '+49', flag: '🇩🇪', label: '+49 Alemania' },
    { code: '+33', flag: '🇫🇷', label: '+33 Francia' },
  ];

  const fetchZipData = async (cp: string) => {
    if (cp.length !== 5) return;
    setZipLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/zipcode/${cp}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.city) {
        setNewAddr(prev => ({ ...prev, city: data.city, state: data.state || prev.state, neighborhood: data.colonies?.[0] || prev.neighborhood }));
        setColonyOptions(data.colonies || []);
      }
    } catch { /* silent */ } finally {
      setZipLoading(false);
    }
  };

  const saveNewAddress = async () => {
    if (!addrClient) return;
    if (!newAddr.street || !newAddr.city || !newAddr.state || !newAddr.zipCode || !newAddr.neighborhood) {
      Alert.alert('Campos requeridos', 'Completa: calle, colonia, ciudad, estado y código postal');
      return;
    }
    setNewAddrSaving(true);
    try {
      const phone = newAddr.phone ? `${newAddr.countryCode}${newAddr.phone.replace(/\D/g, '')}` : '';
      const res = await fetch(`${API_URL}/api/advisor/clients/${addrClient.id}/addresses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alias: newAddr.alias || 'Dirección',
          recipientName: newAddr.recipientName,
          street: newAddr.street,
          exteriorNumber: newAddr.exteriorNumber,
          interiorNumber: newAddr.interiorNumber,
          neighborhood: newAddr.neighborhood,
          city: newAddr.city,
          state: newAddr.state,
          zipCode: newAddr.zipCode,
          phone,
          receptionHours: newAddr.receptionHours,
          notes: newAddr.notes,
          isDefault: newAddr.isDefault,
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Error'); }
      const r2 = await fetch(`${API_URL}/api/advisor/clients/${addrClient.id}/addresses`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await r2.json();
      setAddrList(Array.isArray(data) ? data : []);
      setShowNewAddrForm(false);
      setNewAddr(emptyNewAddr);
      setColonyOptions([]);
      Alert.alert('Dirección guardada', 'La dirección fue agregada correctamente');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo guardar la dirección');
    } finally {
      setNewAddrSaving(false);
    }
  };

  const loadClients = useCallback(async (reset = false) => {
    try {
      const currentPage = reset ? 1 : page;
      let url = `${API_URL}/api/advisor/clients?page=${currentPage}&limit=20`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (filter !== 'all') url += `&status=${filter}`;
      if (subAdvisorId) url += `&subAdvisorId=${subAdvisorId}`;
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
        <Text style={styles.headerTitle}>{subAdvisorName ? `Clientes de ${subAdvisorName.split(' ')[0]}` : 'Mis Clientes'}</Text>
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
      <Modal visible={addrModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (showNewAddrForm) { setShowNewAddrForm(false); } else { setAddrModal(false); } }}>
        <View style={styles.modalContainer}>
          <View style={[styles.modalHeader, showNewAddrForm ? { backgroundColor: PURPLE } : {}]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {showNewAddrForm && (
                <TouchableOpacity onPress={() => setShowNewAddrForm(false)} style={{ padding: 4, marginRight: 4 }}>
                  <Ionicons name="arrow-back" size={22} color="#fff" />
                </TouchableOpacity>
              )}
              <View>
                <Text style={styles.modalTitle}>{showNewAddrForm ? '📍 Nueva dirección' : '📍 Direcciones'}</Text>
                <Text style={styles.modalSubtitle}>{addrClient?.full_name}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {!showNewAddrForm && (
                <TouchableOpacity
                  style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  onPress={() => { setShowNewAddrForm(true); setNewAddr(emptyNewAddr); setColonyOptions([]); }}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Agregar</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => { setShowNewAddrForm(false); setAddrModal(false); }} style={styles.modalClose}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
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
              <TouchableOpacity
                style={{ marginTop: 20, backgroundColor: PURPLE, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                onPress={() => { setShowNewAddrForm(true); setNewAddr(emptyNewAddr); setColonyOptions([]); }}
              >
                <Ionicons name="add-circle-outline" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Agregar primera dirección</Text>
              </TouchableOpacity>
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
          {/* ─── Formulario Nueva Dirección (inline, mismo modal) ─── */}
          {showNewAddrForm && (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">

            {/* Alias */}
            <View style={nf.field}>
              <Text style={nf.label}>Alias</Text>
              <TextInput style={nf.input} placeholder="Ej: Casa, Oficina, Bodega..." value={newAddr.alias} onChangeText={v => setNewAddr(p => ({ ...p, alias: v }))} />
            </View>

            {/* Destinatario */}
            <View style={nf.field}>
              <Text style={nf.label}>Nombre del destinatario</Text>
              <TextInput style={nf.input} placeholder="Nombre completo" value={newAddr.recipientName} onChangeText={v => setNewAddr(p => ({ ...p, recipientName: v }))} />
            </View>

            {/* Teléfono con lada desplegable */}
            <View style={nf.field}>
              <Text style={nf.label}>Teléfono</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[nf.input, { width: 110, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 }]}
                  onPress={() => setShowLadaPicker(p => !p)}
                >
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#111' }}>
                    {LADAS.find(l => l.code === newAddr.countryCode)?.flag ?? '🌎'} {newAddr.countryCode}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color="#666" />
                </TouchableOpacity>
                <TextInput style={[nf.input, { flex: 1 }]} placeholder="10 dígitos" keyboardType="numeric" maxLength={10} value={newAddr.phone} onChangeText={v => setNewAddr(p => ({ ...p, phone: v.replace(/\D/g, '') }))} />
              </View>
              {showLadaPicker && (
                <View style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginTop: 4, backgroundColor: '#fff', overflow: 'hidden' }}>
                  {LADAS.map(l => (
                    <TouchableOpacity
                      key={l.code}
                      style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: newAddr.countryCode === l.code ? PURPLE + '15' : '#fff' }}
                      onPress={() => { setNewAddr(p => ({ ...p, countryCode: l.code })); setShowLadaPicker(false); }}
                    >
                      <Text style={{ fontSize: 20 }}>{l.flag}</Text>
                      <Text style={{ fontSize: 14, color: newAddr.countryCode === l.code ? PURPLE : '#333', fontWeight: newAddr.countryCode === l.code ? '700' : '400' }}>{l.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={nf.divider}><Text style={nf.dividerText}>📍 Dirección</Text></View>

            {/* C.P. — auto-fill */}
            <View style={nf.field}>
              <Text style={nf.label}>Código Postal *</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  style={[nf.input, { flex: 1 }]}
                  placeholder="5 dígitos"
                  keyboardType="numeric"
                  maxLength={5}
                  value={newAddr.zipCode}
                  onChangeText={v => {
                    const cp = v.replace(/\D/g, '');
                    setNewAddr(p => ({ ...p, zipCode: cp }));
                    if (cp.length === 5) fetchZipData(cp);
                  }}
                />
                {zipLoading && <ActivityIndicator size="small" color={PURPLE} />}
              </View>
            </View>

            {/* Colonia — picker si hay opciones */}
            <View style={nf.field}>
              <Text style={nf.label}>Colonia *</Text>
              {colonyOptions.length > 0 ? (
                <>
                  <TouchableOpacity style={[nf.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]} onPress={() => setShowColonyPicker(p => !p)}>
                    <Text style={{ color: newAddr.neighborhood ? '#111' : '#aaa', fontSize: 15 }}>{newAddr.neighborhood || 'Selecciona la colonia'}</Text>
                    <Ionicons name="chevron-down" size={16} color="#666" />
                  </TouchableOpacity>
                  {showColonyPicker && (
                    <View style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, maxHeight: 180, marginTop: 4 }}>
                      <ScrollView nestedScrollEnabled>
                        {colonyOptions.map(c => (
                          <TouchableOpacity key={c} style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}
                            onPress={() => { setNewAddr(p => ({ ...p, neighborhood: c })); setShowColonyPicker(false); }}>
                            <Text style={{ fontSize: 14, color: '#333' }}>{c}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </>
              ) : (
                <TextInput style={nf.input} placeholder="Ingresa el C.P. para ver colonias" value={newAddr.neighborhood} onChangeText={v => setNewAddr(p => ({ ...p, neighborhood: v }))} />
              )}
            </View>

            {/* Ciudad y Estado */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={[nf.field, { flex: 1 }]}>
                <Text style={nf.label}>Ciudad *</Text>
                <TextInput style={nf.input} placeholder="Ciudad" value={newAddr.city} onChangeText={v => setNewAddr(p => ({ ...p, city: v }))} />
              </View>
              <View style={[nf.field, { flex: 1 }]}>
                <Text style={nf.label}>Estado *</Text>
                <TextInput style={[nf.input, colonyOptions.length > 0 && newAddr.state ? { backgroundColor: '#f5f5f5', color: '#666' } : {}]} placeholder="Estado" value={newAddr.state} onChangeText={v => setNewAddr(p => ({ ...p, state: v }))} editable={!(colonyOptions.length > 0 && !!newAddr.state)} />
              </View>
            </View>

            {/* Calle + Números */}
            <View style={nf.field}>
              <Text style={nf.label}>Calle *</Text>
              <TextInput style={nf.input} placeholder="Nombre de la calle" value={newAddr.street} onChangeText={v => setNewAddr(p => ({ ...p, street: v }))} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={[nf.field, { flex: 1 }]}>
                <Text style={nf.label}>No. Exterior *</Text>
                <TextInput style={nf.input} placeholder="123" value={newAddr.exteriorNumber} onChangeText={v => setNewAddr(p => ({ ...p, exteriorNumber: v }))} />
              </View>
              <View style={[nf.field, { flex: 1 }]}>
                <Text style={nf.label}>No. Interior</Text>
                <TextInput style={nf.input} placeholder="Opcional" value={newAddr.interiorNumber} onChangeText={v => setNewAddr(p => ({ ...p, interiorNumber: v }))} />
              </View>
            </View>

            <View style={nf.divider}><Text style={nf.dividerText}>🕐 Entrega (opcional)</Text></View>

            {/* Horario de entrega */}
            <View style={nf.field}>
              <Text style={nf.label}>Horario de recepción</Text>
              <TextInput style={nf.input} placeholder="Ej: Lun-Vie 9:00-18:00, Sáb 10:00-14:00" value={newAddr.receptionHours} onChangeText={v => setNewAddr(p => ({ ...p, receptionHours: v }))} />
            </View>

            <View style={nf.divider}><Text style={nf.dividerText}>📝 Notas (opcional)</Text></View>

            {/* Notas */}
            <View style={nf.field}>
              <Text style={nf.label}>Notas / Referencia</Text>
              <TextInput style={[nf.input, { height: 80, textAlignVertical: 'top', paddingTop: 10 }]} placeholder="Indicaciones especiales, referencias, etc." multiline value={newAddr.notes} onChangeText={v => setNewAddr(p => ({ ...p, notes: v }))} />
            </View>

            {/* Dirección principal toggle */}
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: newAddr.isDefault ? PURPLE + '15' : '#f5f5f5', borderRadius: 10, marginBottom: 8 }}
              onPress={() => setNewAddr(p => ({ ...p, isDefault: !p.isDefault }))}>
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: PURPLE, backgroundColor: newAddr.isDefault ? PURPLE : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {newAddr.isDefault && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <Text style={{ fontSize: 14, color: '#333', fontWeight: '500' }}>Establecer como dirección principal</Text>
            </TouchableOpacity>

            {/* Botones */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 32 }}>
              <TouchableOpacity style={{ flex: 1, borderWidth: 1.5, borderColor: '#ccc', borderRadius: 10, paddingVertical: 14, alignItems: 'center' }} onPress={() => setShowNewAddrForm(false)}>
                <Text style={{ color: '#666', fontWeight: '600', fontSize: 15 }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[{ flex: 2, backgroundColor: PURPLE, borderRadius: 10, paddingVertical: 14, alignItems: 'center' }, newAddrSaving && { opacity: 0.6 }]} onPress={saveNewAddress} disabled={newAddrSaving}>
                {newAddrSaving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Guardar dirección</Text>}
              </TouchableOpacity>
            </View>
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

// Estilos del formulario de nueva dirección
const nf = StyleSheet.create({
  field: { gap: 4 },
  label: { fontSize: 12, fontWeight: '600', color: '#555', marginBottom: 2 },
  input: {
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#fff',
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 10,
    marginTop: 4,
  },
  dividerText: { fontSize: 12, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 },
});
