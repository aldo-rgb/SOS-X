/**
 * WelcomeKitAdminScreen — "Centro de Soporte" → Kit de Bienvenida
 * -----------------------------------------------------------
 * Control del Kit de Bienvenida desde la app (Super Admin / staff).
 * Replica lo esencial del panel web "Centro de Soporte":
 *   - Tarjetas de estado con conteos (Solicitados, Seleccionaron, ...).
 *   - Listado con búsqueda y filtro por estado.
 *   - ASIGNAR el kit a un cliente: busca por nombre / Box ID / teléfono /
 *     correo y lo agrega a la lista (status 'solicitado'). El cliente
 *     recibe notificación "🎁 ¡Tienes un regalo!".
 *
 * Endpoints:
 *   GET  /api/admin/welcome-kit                → lista + stats
 *   GET  /api/admin/welcome-kit/search-client  → buscar clientes
 *   POST /api/admin/welcome-kit                → asignar (crear)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  StatusBar,
  FlatList,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { API_URL } from '../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'WelcomeKitAdmin'>;

const ORANGE = '#F05A28';
const BG = '#F4F6F8';

interface KitRow {
  id: number;
  user_id?: number | null;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  box_id?: string | null;
  status: string;
  selected_product_name?: string | null;
  usa_tracking?: string | null;
  estafeta_tracking?: string | null;
  guide_status?: string | null;
  notes?: string | null;
  requested_at?: string | null;
}

interface KitStats {
  solicitado: number; seleccionado: number; instrucciones: number;
  por_enviar: number; enviado: number; entregado: number; cancelado: number; total: number;
}

interface ClientHit { id: number; full_name: string; box_id?: string | null; phone?: string | null; email?: string | null; }

// Estado → etiqueta + color (alineado con el panel web).
const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  solicitado:   { label: 'Solicitado',       color: '#1565C0', bg: '#E3F2FD' },
  seleccionado: { label: 'Seleccionaron',    color: '#6A1B9A', bg: '#F3E5F5' },
  instrucciones:{ label: 'Con instrucciones', color: '#E65100', bg: '#FFF3E0' },
  por_enviar:   { label: 'Por enviar',       color: '#6A1B9A', bg: '#F3E5F5' },
  enviado:      { label: 'Enviados',         color: '#2E7D32', bg: '#E8F5E9' },
  entregado:    { label: 'Entregados',       color: '#1B5E20', bg: '#DCEDC8' },
  cancelado:    { label: 'Cancelados',       color: '#C62828', bg: '#FFEBEE' },
};

// Orden y config de las tarjetas de estado (incluye "Todos").
const STAT_CARDS: Array<{ key: keyof KitStats | 'all'; label: string; color: string }> = [
  { key: 'all',          label: 'Total',           color: '#455A64' },
  { key: 'solicitado',   label: 'Solicitados',     color: '#1565C0' },
  { key: 'seleccionado', label: 'Seleccionaron',   color: '#6A1B9A' },
  { key: 'instrucciones',label: 'Con instrucciones',color: '#E65100' },
  { key: 'por_enviar',   label: 'Por enviar',      color: '#6A1B9A' },
  { key: 'enviado',      label: 'Enviados',        color: '#2E7D32' },
  { key: 'entregado',    label: 'Entregados',      color: '#1B5E20' },
  { key: 'cancelado',    label: 'Cancelados',      color: '#C62828' },
];

const initials = (name: string) =>
  (name || '?').trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('');

const formatDate = (iso?: string | null) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return ''; }
};

export default function WelcomeKitAdminScreen({ navigation, route }: Props) {
  const { token } = route.params;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<KitRow[]>([]);
  const [stats, setStats] = useState<KitStats | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modal de asignación
  const [assignOpen, setAssignOpen] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [hits, setHits] = useState<ClientHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [assigning, setAssigning] = useState<number | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (search.trim()) qs.set('search', search.trim());
      const res = await fetch(`${API_URL}/api/admin/welcome-kit?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || `HTTP ${res.status}`);
      setRows(data.data || []);
      setStats(data.stats || null);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo cargar el Kit de Bienvenida');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  // Búsqueda de clientes (debounce) dentro del modal de asignación.
  useEffect(() => {
    if (!assignOpen) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = clientQuery.trim();
    if (q.length < 2) { setHits([]); setSearching(false); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin/welcome-kit/search-client?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setHits(data.data || []);
      } catch { setHits([]); }
      finally { setSearching(false); }
    }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [clientQuery, assignOpen, token]);

  const assign = async (c: ClientHit) => {
    setAssigning(c.id);
    try {
      const res = await fetch(`${API_URL}/api/admin/welcome-kit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          user_id: c.id,
          full_name: c.full_name,
          box_id: c.box_id || null,
          phone: c.phone || null,
          email: c.email || null,
          notes: 'Asignado desde Centro de Soporte (app)',
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        Alert.alert('Ya tiene kit', `${c.full_name} ya está en la lista del Kit de Bienvenida.`);
        return;
      }
      if (!res.ok || data.success === false) throw new Error(data.error || `HTTP ${res.status}`);
      setAssignOpen(false);
      setClientQuery('');
      setHits([]);
      Alert.alert('✅ Kit asignado', `${c.full_name} recibió el Kit de Bienvenida. Se le notificó en la app.`);
      setStatusFilter('all');
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo asignar el kit');
    } finally {
      setAssigning(null);
    }
  };

  const statCount = (key: keyof KitStats | 'all'): number => {
    if (!stats) return 0;
    return key === 'all' ? stats.total : (stats[key as keyof KitStats] || 0);
  };

  const renderRow = ({ item }: { item: KitRow }) => {
    const meta = STATUS_META[item.status] || { label: item.status, color: '#555', bg: '#EEE' };
    return (
      <View style={styles.row}>
        <View style={styles.avatar}><Text style={styles.avatarTxt}>{initials(item.full_name)}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowName} numberOfLines={1}>{item.full_name || 'Sin nombre'}</Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {item.box_id ? `${item.box_id} · ` : ''}{item.phone || item.email || '—'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
            <View style={[styles.statusChip, { backgroundColor: meta.bg }]}>
              <Text style={[styles.statusChipTxt, { color: meta.color }]}>{meta.label}</Text>
            </View>
            {!!item.selected_product_name ? (
              <View style={styles.giftChip}>
                <Ionicons name="gift" size={11} color="#B26A00" />
                <Text style={styles.giftChipTxt} numberOfLines={1}>{item.selected_product_name}</Text>
              </View>
            ) : (
              <Text style={styles.noGift}>Sin elegir regalo</Text>
            )}
          </View>
        </View>
        <Text style={styles.rowDate}>{formatDate(item.requested_at)}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={ORANGE} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Centro de Soporte</Text>
          <Text style={styles.headerSubtitle}>Kit de Bienvenida · {stats?.total ?? 0} en total</Text>
        </View>
        <TouchableOpacity onPress={() => { setRefreshing(true); load(); }} style={styles.headerBtn} hitSlop={10}>
          <Ionicons name="refresh" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Tarjetas de estado (filtran al tocar) */}
      <View style={styles.statsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
          {STAT_CARDS.map(c => {
            const active = statusFilter === c.key;
            return (
              <TouchableOpacity
                key={c.key}
                onPress={() => setStatusFilter(active && c.key !== 'all' ? 'all' : String(c.key))}
                style={[styles.statCard, { borderLeftColor: c.color }, active && styles.statCardActive]}
                activeOpacity={0.8}
              >
                <Text style={[styles.statNum, { color: c.color }]}>{statCount(c.key)}</Text>
                <Text style={styles.statLbl} numberOfLines={1}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Buscar + Asignar */}
      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color="#888" />
          <TextInput
            placeholder="Buscar por nombre, teléfono, correo o Box ID"
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            placeholderTextColor="#999"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color="#999" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.assignBtn} onPress={() => setAssignOpen(true)} activeOpacity={0.85}>
          <Ionicons name="gift" size={18} color="#fff" />
          <Text style={styles.assignBtnTxt}>Asignar Kit a un cliente</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => String(r.id)}
          renderItem={renderRow}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={ORANGE} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="gift-outline" size={42} color="#999" />
              <Text style={{ color: '#888', marginTop: 8 }}>Sin solicitudes de kit</Text>
            </View>
          }
        />
      )}

      {/* Modal: Asignar Kit */}
      <Modal visible={assignOpen} animationType="slide" transparent onRequestClose={() => setAssignOpen(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="gift" size={20} color={ORANGE} />
                <Text style={styles.modalTitle}>Asignar Kit de Bienvenida</Text>
              </View>
              <TouchableOpacity onPress={() => { setAssignOpen(false); setClientQuery(''); setHits([]); }} hitSlop={10}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 16, paddingBottom: 8 }}>
              <Text style={styles.modalHint}>Busca al cliente y tócalo para regalarle el Kit de Bienvenida. Recibirá una notificación en su app.</Text>
              <View style={[styles.searchBox, { margin: 0, marginTop: 12 }]}>
                <Ionicons name="search" size={16} color="#888" />
                <TextInput
                  placeholder="Nombre, Box ID, teléfono o correo"
                  value={clientQuery}
                  onChangeText={setClientQuery}
                  style={styles.searchInput}
                  placeholderTextColor="#999"
                  autoFocus
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {searching && <ActivityIndicator size="small" color={ORANGE} />}
              </View>
            </View>
            <FlatList
              data={hits}
              keyExtractor={(c) => String(c.id)}
              style={{ maxHeight: 340 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.hitRow}
                  onPress={() => assign(item)}
                  disabled={assigning !== null}
                  activeOpacity={0.7}
                >
                  <View style={styles.avatar}><Text style={styles.avatarTxt}>{initials(item.full_name)}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{item.full_name}</Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {item.box_id ? `${item.box_id} · ` : ''}{item.phone || item.email || '—'}
                    </Text>
                  </View>
                  {assigning === item.id
                    ? <ActivityIndicator size="small" color={ORANGE} />
                    : <Ionicons name="add-circle" size={26} color={ORANGE} />}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                clientQuery.trim().length < 2 ? (
                  <Text style={styles.emptyHint}>Escribe al menos 2 caracteres para buscar.</Text>
                ) : !searching ? (
                  <Text style={styles.emptyHint}>Sin coincidencias.</Text>
                ) : null
              }
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  header: { backgroundColor: ORANGE, paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  headerBtn: { padding: 6 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  headerSubtitle: { color: '#FFE0D2', fontSize: 12, marginTop: 2 },

  statsWrap: { backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#DDD' },
  statCard: { minWidth: 96, backgroundColor: '#FAFAFA', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, borderLeftWidth: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E4E4E4' },
  statCardActive: { backgroundColor: '#FFF3EE', borderColor: ORANGE },
  statNum: { fontSize: 20, fontWeight: '800' },
  statLbl: { fontSize: 11, color: '#666', marginTop: 2, fontWeight: '600' },

  toolbar: { backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#DDD', paddingBottom: 12 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F4F6F8', margin: 12, marginBottom: 0, paddingHorizontal: 12, borderRadius: 10, height: 40 },
  searchInput: { flex: 1, fontSize: 14, color: '#222' },
  assignBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: ORANGE, marginHorizontal: 12, marginTop: 10, height: 46, borderRadius: 12 },
  assignBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },

  row: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#fff', borderRadius: 10, gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  rowName: { fontSize: 15, fontWeight: '700', color: '#222' },
  rowMeta: { fontSize: 12, color: '#777', marginTop: 2 },
  rowDate: { fontSize: 11, color: '#999', marginLeft: 6 },

  statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusChipTxt: { fontSize: 11, fontWeight: '700' },
  giftChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFF7E6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, maxWidth: 160 },
  giftChipTxt: { fontSize: 11, color: '#B26A00', fontWeight: '600' },
  noGift: { fontSize: 11, color: '#AAA', fontStyle: 'italic' },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', paddingBottom: 24 },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#EEE' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#222' },
  modalHint: { fontSize: 13, color: '#666', lineHeight: 18 },
  hitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#F0F0F0' },
  emptyHint: { textAlign: 'center', color: '#999', fontSize: 13, paddingVertical: 20 },
});
