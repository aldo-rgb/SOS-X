/**
 * ChinaAirInventoryScreen - Inventario TDI Aéreo China
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  FlatList, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#111';

interface InvPackage {
  id: number;
  tracking_internal: string;
  international_tracking: string | null;
  awb_number: string | null;
  status: string;
  description: string | null;
  weight: string | number | null;
  received_at: string | null;
  user_box_id: string | null;
  user_name: string | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  received_china: { label: 'Recibido China', color: '#1976D2' },
  in_transit: { label: 'En tránsito', color: ORANGE },
  in_customs_gz: { label: 'Aduana GZ', color: '#7B1FA2' },
  received_mty: { label: 'Bodega MTY', color: '#2E7D32' },
  ready_pickup: { label: 'En Ruta', color: '#0097A7' },
  delivered: { label: 'Entregado', color: '#424242' },
};

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'received_china', label: 'Recibidos China' },
  { value: 'in_transit', label: 'En tránsito' },
  { value: 'received_mty', label: 'En MTY' },
  { value: 'delivered', label: 'Entregados' },
];

export default function ChinaAirInventoryScreen({ route, navigation }: any) {
  const { token } = route.params;
  const [packages, setPackages] = useState<InvPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [visibleCount, setVisibleCount] = useState(50);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '500' });
      const res = await fetch(`${API_URL}/api/admin/china-air/inventory?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPackages(data.packages || []);
      }
    } catch (err) {
      console.error('Error inventory:', err);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); setVisibleCount(50); load(); };

  const filtered = useMemo(() => {
    let list = packages;
    if (statusFilter !== 'all') list = list.filter((p) => p.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => {
        const t = (p.tracking_internal || '').toLowerCase();
        const it = (p.international_tracking || '').toLowerCase();
        const box = (p.user_box_id || '').toLowerCase();
        const name = (p.user_name || '').toLowerCase();
        const awb = (p.awb_number || '').toLowerCase();
        return t.includes(q) || it.includes(q) || box.includes(q) || name.includes(q) || awb.includes(q);
      });
    }
    return list;
  }, [packages, statusFilter, search]);

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    packages.forEach((p) => { counts[p.status] = (counts[p.status] || 0) + 1; });
    return counts;
  }, [packages]);

  const visibleItems = filtered.slice(0, visibleCount);

  const renderItem = ({ item }: { item: InvPackage }) => {
    const info = STATUS_LABELS[item.status] || { label: item.status, color: '#888' };
    return (
      <View style={styles.pkgCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pkgTracking}>{item.tracking_internal}</Text>
          <Text style={styles.pkgClient}>
            {item.user_box_id || ''}{item.user_name ? ` · ${item.user_name}` : ''}
          </Text>
          {item.awb_number && <Text style={styles.pkgSubtext}>AWB {item.awb_number}</Text>}
          {item.description && <Text style={styles.pkgSubtext}>{item.description}</Text>}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <View style={[styles.statusBadge, { backgroundColor: info.color + '20' }]}>
            <Text style={[styles.statusText, { color: info.color }]}>{info.label}</Text>
          </View>
          {item.weight ? <Text style={styles.pkgWeight}>{Number(item.weight).toFixed(2)} kg</Text> : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.headerTitle}>Inventario Aéreo China</Text>
          <Text style={styles.headerSubtitle}>{packages.length} paquetes totales</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} disabled={loading}>
          <Ionicons name="refresh" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsScroll} contentContainerStyle={styles.statsContent}>
        <TouchableOpacity style={[styles.statChip, statusFilter === 'all' && styles.statChipActive]} onPress={() => setStatusFilter('all')}>
          <Text style={[styles.statChipNum, { color: ORANGE }]}>{packages.length}</Text>
          <Text style={styles.statChipLabel} numberOfLines={1}>Total</Text>
        </TouchableOpacity>
        {Object.entries(stats).map(([key, count]) => {
          const info = STATUS_LABELS[key]; if (!info) return null;
          const active = statusFilter === key;
          return (
            <TouchableOpacity key={key} style={[styles.statChip, active && { borderColor: info.color, borderWidth: 2 }]} onPress={() => setStatusFilter(key)}>
              <Text style={[styles.statChipNum, { color: info.color }]}>{count}</Text>
              <Text style={styles.statChipLabel} numberOfLines={2}>{info.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#999" />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar tracking, AWB, cliente..."
            placeholderTextColor="#999"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color="#999" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          {STATUS_FILTERS.map((f) => (
            <TouchableOpacity key={f.value} style={[styles.filterChip, statusFilter === f.value && styles.filterChipActive]} onPress={() => setStatusFilter(f.value)}>
              <Text style={[styles.filterChipText, statusFilter === f.value && styles.filterChipTextActive]} numberOfLines={1}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={visibleItems}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 30 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="airplane-outline" size={48} color="#999" />
              <Text style={styles.emptyText}>
                {search || statusFilter !== 'all' ? 'No hay resultados con esos filtros' : 'No hay paquetes en inventario'}
              </Text>
            </View>
          }
          ListFooterComponent={
            visibleCount < filtered.length ? (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={() => setVisibleCount((c) => c + 50)}>
                <Text style={styles.loadMoreText}>Cargar más ({filtered.length - visibleCount} restantes)</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: BLACK, paddingHorizontal: 14, paddingVertical: 14 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  headerSubtitle: { fontSize: 12, color: '#fff', opacity: 0.7 },
  statsScroll: { flexGrow: 0, maxHeight: 92 },
  statsContent: { paddingVertical: 10, paddingHorizontal: 12, gap: 8 },
  statChip: { width: 92, height: 72, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#ECECEC' },
  statChipActive: { borderColor: ORANGE, borderWidth: 2 },
  statChipNum: { fontSize: 20, fontWeight: '800', lineHeight: 24 },
  statChipLabel: { fontSize: 10, color: '#555', marginTop: 2, textAlign: 'center', lineHeight: 12 },
  searchRow: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, gap: 8, borderWidth: 1, borderColor: '#E0E0E0' },
  searchInput: { flex: 1, fontSize: 14, color: BLACK },
  filterWrap: { paddingBottom: 10, backgroundColor: '#F5F5F5' },
  filterContent: { paddingHorizontal: 12, gap: 8, alignItems: 'center' },
  filterChip: { backgroundColor: '#fff', paddingHorizontal: 16, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#E0E0E0', justifyContent: 'center' },
  filterChipActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  filterChipText: { fontSize: 13, color: '#444', fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  pkgCard: { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 8, borderRadius: 10, padding: 12, borderLeftWidth: 4, borderLeftColor: ORANGE },
  pkgTracking: { fontSize: 14, fontWeight: '700', color: ORANGE },
  pkgClient: { fontSize: 12, color: '#444', marginTop: 4, fontWeight: '600' },
  pkgSubtext: { fontSize: 11, color: '#888', marginTop: 2 },
  pkgWeight: { fontSize: 12, fontWeight: '700', color: BLACK, marginTop: 6 },
  statusBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, maxWidth: 130 },
  statusText: { fontSize: 10, fontWeight: '700', textAlign: 'center' },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 13, color: '#999', marginTop: 10, textAlign: 'center' },
  loadMoreBtn: { backgroundColor: '#fff', margin: 12, padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: ORANGE },
  loadMoreText: { color: ORANGE, fontWeight: '700' },
});
