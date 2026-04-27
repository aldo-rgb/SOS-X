/**
 * POBoxInventoryScreen - Inventario PO Box USA
 *
 * Espejo móvil de POBoxInventoryPage (web):
 * - Lista paquetes PO Box con búsqueda + filtro de estado
 * - Stats por estado (Recibido, En tránsito, Entregado, etc.)
 * - Pull-to-refresh + paginación incremental
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#111';

interface InventoryPackage {
  id: number;
  tracking?: string;
  tracking_internal?: string;
  description?: string;
  weight?: number;
  status: string;
  receivedAt?: string;
  received_at?: string;
  client?: { name?: string; boxId?: string };
  box_id?: string;
  client_name?: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  received: { label: 'Recibido CEDIS HTX', color: '#1976D2' },
  processing: { label: 'Procesando', color: '#F9A825' },
  in_transit: { label: 'En tránsito a MTY', color: ORANGE },
  received_mty: { label: 'Recibido CEDIS MTY', color: '#2E7D32' },
  ready_pickup: { label: 'En Ruta', color: '#0097A7' },
  shipped: { label: 'Enviado', color: '#7B1FA2' },
  delivered: { label: 'Entregado', color: '#424242' },
  reempacado: { label: 'Reempacado', color: '#E91E63' },
  pending_repack: { label: 'Pendiente reempaque', color: '#FF7043' },
};

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'received', label: 'Recibidos' },
  { value: 'in_transit', label: 'En tránsito' },
  { value: 'received_mty', label: 'En MTY' },
  { value: 'ready_pickup', label: 'En Ruta' },
  { value: 'delivered', label: 'Entregados' },
];

export default function POBoxInventoryScreen({ route, navigation }: any) {
  const { token } = route.params;
  const [packages, setPackages] = useState<InventoryPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [visibleCount, setVisibleCount] = useState(50);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/packages?limit=1000`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPackages(data.packages || []);
      }
    } catch (err) {
      console.error('Error loading inventory:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    setVisibleCount(50);
    load();
  };

  const filtered = useMemo(() => {
    let list = packages;
    if (statusFilter !== 'all') {
      list = list.filter((p) => p.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => {
        const tracking = (p.tracking || p.tracking_internal || '').toLowerCase();
        const boxId = (p.client?.boxId || p.box_id || '').toLowerCase();
        const name = (p.client?.name || p.client_name || '').toLowerCase();
        const desc = (p.description || '').toLowerCase();
        return (
          tracking.includes(q) || boxId.includes(q) || name.includes(q) || desc.includes(q)
        );
      });
    }
    return list;
  }, [packages, statusFilter, search]);

  // Stats por status
  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    packages.forEach((p) => {
      counts[p.status] = (counts[p.status] || 0) + 1;
    });
    return counts;
  }, [packages]);

  const visibleItems = filtered.slice(0, visibleCount);

  const renderItem = ({ item }: { item: InventoryPackage }) => {
    const tracking = item.tracking || item.tracking_internal || '';
    const boxId = item.client?.boxId || item.box_id || '';
    const name = item.client?.name || item.client_name || '';
    const statusInfo = STATUS_LABELS[item.status] || { label: item.status, color: '#888' };
    const date = item.receivedAt || item.received_at;
    return (
      <View style={styles.pkgCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pkgTracking}>{tracking}</Text>
          <Text style={styles.pkgClient}>
            {boxId}{name ? ` · ${name}` : ''}
          </Text>
          {item.description ? <Text style={styles.pkgSubtext}>{item.description}</Text> : null}
          {date ? (
            <Text style={styles.pkgSubtext}>
              {new Date(date).toLocaleDateString('es-MX')}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + '20' }]}>
            <Text style={[styles.statusText, { color: statusInfo.color }]}>
              {statusInfo.label}
            </Text>
          </View>
          {item.weight ? (
            <Text style={styles.pkgWeight}>{Number(item.weight).toFixed(2)} kg</Text>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Inventario PO Box</Text>
          <Text style={styles.headerSubtitle}>{packages.length} paquetes totales</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} disabled={loading}>
          <Ionicons name="refresh" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Stats horizontal scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.statsScroll}
        contentContainerStyle={styles.statsContent}
      >
        <TouchableOpacity
          style={[styles.statChip, statusFilter === 'all' && styles.statChipActive]}
          onPress={() => setStatusFilter('all')}
          activeOpacity={0.8}
        >
          <Text style={[styles.statChipNum, { color: ORANGE }]}>{packages.length}</Text>
          <Text style={styles.statChipLabel} numberOfLines={1}>Total</Text>
        </TouchableOpacity>
        {Object.entries(stats).map(([key, count]) => {
          const info = STATUS_LABELS[key];
          if (!info) return null;
          const active = statusFilter === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.statChip, active && { borderColor: info.color, borderWidth: 2 }]}
              onPress={() => setStatusFilter(key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.statChipNum, { color: info.color }]}>{count}</Text>
              <Text style={styles.statChipLabel} numberOfLines={2}>{info.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#999" />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por tracking, box ID, cliente..."
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

      {/* Filter chips */}
      <View style={styles.filterWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContent}
        >
          {STATUS_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.value}
              style={[
                styles.filterChip,
                statusFilter === f.value && styles.filterChipActive,
              ]}
              onPress={() => setStatusFilter(f.value)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.filterChipText,
                  statusFilter === f.value && styles.filterChipTextActive,
                ]}
                numberOfLines={1}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={visibleItems}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 30 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="file-tray-stacked-outline" size={48} color="#999" />
              <Text style={styles.emptyText}>
                {search || statusFilter !== 'all'
                  ? 'No hay resultados con esos filtros'
                  : 'No hay paquetes en el inventario'}
              </Text>
            </View>
          }
          ListFooterComponent={
            visibleCount < filtered.length ? (
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={() => setVisibleCount((c) => c + 50)}
              >
                <Text style={styles.loadMoreText}>
                  Cargar más ({filtered.length - visibleCount} restantes)
                </Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BLACK,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  headerSubtitle: { fontSize: 12, color: '#fff', opacity: 0.7 },

  statsScroll: { flexGrow: 0, maxHeight: 92 },
  statsContent: { paddingVertical: 10, paddingHorizontal: 12, gap: 8 },
  statChip: {
    width: 92,
    height: 72,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ECECEC',
  },
  statChipActive: { borderColor: ORANGE, borderWidth: 2 },
  statChipNum: { fontSize: 20, fontWeight: '800', lineHeight: 24 },
  statChipLabel: { fontSize: 10, color: '#555', marginTop: 2, textAlign: 'center', lineHeight: 12 },

  searchRow: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  searchInput: { flex: 1, fontSize: 14, color: BLACK },

  filterWrap: { paddingBottom: 10, backgroundColor: '#F5F5F5' },
  filterContent: { paddingHorizontal: 12, gap: 8, alignItems: 'center' },
  filterChip: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  filterChipText: { fontSize: 13, color: '#444', fontWeight: '600', lineHeight: 16 },
  filterChipTextActive: { color: '#fff' },

  pkgCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: ORANGE,
  },
  pkgTracking: { fontSize: 14, fontWeight: '700', color: ORANGE },
  pkgClient: { fontSize: 12, color: '#444', marginTop: 4, fontWeight: '600' },
  pkgSubtext: { fontSize: 11, color: '#888', marginTop: 2 },
  pkgWeight: { fontSize: 12, fontWeight: '700', color: BLACK, marginTop: 6 },
  statusBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: 130,
  },
  statusText: { fontSize: 10, fontWeight: '700', textAlign: 'center' },

  emptyState: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 13, color: '#999', marginTop: 10, textAlign: 'center' },

  loadMoreBtn: {
    backgroundColor: '#fff',
    margin: 12,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: ORANGE,
  },
  loadMoreText: { color: ORANGE, fontWeight: '700' },
});
