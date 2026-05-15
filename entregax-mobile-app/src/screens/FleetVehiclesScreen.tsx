/**
 * FleetVehiclesScreen — Lista de unidades asignadas a la sucursal del usuario.
 *
 * Características:
 *  - Listado filtrado por sucursal (el backend ya aplica branch scope).
 *  - Búsqueda por económico / placas / marca / modelo.
 *  - Chips de filtro: Todos / En ruta / En resguardo / En taller.
 *  - Por unidad: foto, económico, placas, marca/modelo/año, kilometraje,
 *    estado (En ruta · En resguardo · En taller) y chofer asignado si en ruta.
 *  - Tap → FleetVehicleDetail.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, Alert, Image, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';

type FilterKey = 'all' | 'in_route' | 'in_yard' | 'in_shop';
const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'in_route', label: 'En ruta' },
  { key: 'in_yard', label: 'En resguardo' },
  { key: 'in_shop', label: 'En taller' },
];

const getStatusMeta = (v: any): { label: string; color: string; icon: any } => {
  if (v.status === 'in_shop') return { label: 'En taller', color: '#F59E0B', icon: 'build' };
  if (v.status === 'inactive' || v.status === 'retired') return { label: 'Inactiva', color: '#9E9E9E', icon: 'block' };
  // active / available — distinguir por chofer asignado
  if (v.assigned_driver_id) return { label: 'En ruta', color: '#2E7D32', icon: 'local-shipping' };
  return { label: 'En resguardo', color: '#1976D2', icon: 'home-work' };
};

const formatKm = (km: any): string => {
  const n = Number(km || 0);
  if (!isFinite(n)) return '—';
  return n.toLocaleString('es-MX') + ' km';
};

export default function FleetVehiclesScreen({ navigation, route }: any) {
  const { user, token } = route.params || {};
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/fleet/vehicles', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const list = Array.isArray(res.data) ? res.data : [];
      setVehicles(list);
    } catch (e: any) {
      console.error('Error cargando flotilla:', e?.response?.data || e.message);
      Alert.alert('Error', 'No se pudieron cargar las unidades.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter((v) => {
      // Filtro de estado
      if (filter !== 'all') {
        const meta = getStatusMeta(v);
        if (filter === 'in_route' && meta.label !== 'En ruta') return false;
        if (filter === 'in_yard' && meta.label !== 'En resguardo') return false;
        if (filter === 'in_shop' && meta.label !== 'En taller') return false;
      }
      if (!q) return true;
      const hay = [
        v.economic_number, v.license_plates, v.brand, v.model,
        v.driver_name, v.vehicle_type, v.branch_name,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [vehicles, filter, search]);

  const counts = useMemo(() => {
    const c = { all: vehicles.length, in_route: 0, in_yard: 0, in_shop: 0 };
    vehicles.forEach((v) => {
      const meta = getStatusMeta(v);
      if (meta.label === 'En ruta') c.in_route++;
      else if (meta.label === 'En resguardo') c.in_yard++;
      else if (meta.label === 'En taller') c.in_shop++;
    });
    return c;
  }, [vehicles]);

  const renderItem = ({ item }: { item: any }) => {
    const meta = getStatusMeta(item);
    const photo = item.photo_url || item.photo_front_url;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('FleetVehicleDetail', { user, token, vehicleId: item.id })}
      >
        <View style={styles.cardRow}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <MaterialIcons name="directions-car" size={28} color="#bbb" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <View style={styles.headerRow}>
              <Text style={styles.eco}>{item.economic_number || `#${item.id}`}</Text>
              <View style={[styles.statusBadge, { backgroundColor: meta.color + '20' }]}>
                <MaterialIcons name={meta.icon} size={12} color={meta.color} />
                <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
              </View>
            </View>
            <Text style={styles.plate}>🪪 {item.license_plates || 'Sin placas'}</Text>
            <Text style={styles.model} numberOfLines={1}>
              {[item.brand, item.model, item.year ? `(${item.year})` : null].filter(Boolean).join(' ')}
            </Text>
            <View style={styles.metaRow}>
              <MaterialIcons name="speed" size={13} color="#666" />
              <Text style={styles.metaText}>{formatKm(item.current_mileage)}</Text>
              {item.branch_name ? (
                <>
                  <MaterialIcons name="store" size={13} color="#666" style={{ marginLeft: 10 }} />
                  <Text style={styles.metaText} numberOfLines={1}>{item.branch_name}</Text>
                </>
              ) : null}
            </View>
            {meta.label === 'En ruta' && item.driver_name ? (
              <View style={styles.metaRow}>
                <MaterialIcons name="person" size={13} color="#2E7D32" />
                <Text style={[styles.metaText, { color: '#2E7D32', fontWeight: '600' }]} numberOfLines={1}>
                  {item.driver_name}
                </Text>
              </View>
            ) : null}
            {(item.expired_docs > 0 || item.expiring_soon_docs > 0) ? (
              <View style={styles.alertsRow}>
                {item.expired_docs > 0 ? (
                  <View style={[styles.miniBadge, { backgroundColor: '#FFEBEE' }]}>
                    <MaterialIcons name="error" size={12} color="#C62828" />
                    <Text style={[styles.miniBadgeText, { color: '#C62828' }]}>
                      {item.expired_docs} venc.
                    </Text>
                  </View>
                ) : null}
                {item.expiring_soon_docs > 0 ? (
                  <View style={[styles.miniBadge, { backgroundColor: '#FFF8E1' }]}>
                    <MaterialIcons name="schedule" size={12} color="#F57F17" />
                    <Text style={[styles.miniBadgeText, { color: '#F57F17' }]}>
                      {item.expiring_soon_docs} por vencer
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title}>Gestión de Flotilla</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.searchWrap}>
        <MaterialIcons name="search" size={18} color="#888" />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar económico, placas, marca..."
          placeholderTextColor="#999"
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <MaterialIcons name="close" size={18} color="#888" />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count = (counts as any)[f.key];
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {f.label} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#795548" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#795548" />}
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialIcons name="local-shipping" size={48} color="#bbb" />
              <Text style={styles.emptyText}>
                {vehicles.length === 0
                  ? 'No hay unidades asignadas a tu sucursal.'
                  : 'No hay unidades que coincidan con el filtro.'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: '700', color: '#111' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8,
    margin: 12, marginBottom: 4, borderRadius: 10,
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111', paddingVertical: 0 },
  filters: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingVertical: 8, gap: 6,
  },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0',
  },
  filterChipActive: { backgroundColor: '#795548', borderColor: '#795548' },
  filterText: { fontSize: 12, color: '#666', fontWeight: '600' },
  filterTextActive: { color: '#fff' },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05,
    shadowRadius: 3, elevation: 1,
  },
  cardRow: { flexDirection: 'row', gap: 12 },
  thumb: { width: 76, height: 76, borderRadius: 8, backgroundColor: '#eee' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  eco: { fontSize: 16, fontWeight: '700', color: '#111' },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10,
  },
  statusText: { fontSize: 10, fontWeight: '700' },
  plate: { fontSize: 13, color: '#444', fontWeight: '600', marginTop: 1 },
  model: { fontSize: 12, color: '#666', marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  metaText: { fontSize: 11, color: '#666', flexShrink: 1 },
  alertsRow: { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  miniBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
  },
  miniBadgeText: { fontSize: 10, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { marginTop: 12, color: '#888', fontSize: 14, textAlign: 'center' },
});
