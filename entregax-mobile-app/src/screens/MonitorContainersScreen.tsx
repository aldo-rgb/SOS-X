/**
 * MonitorContainersScreen — Listado de contenedores en ruta para rol Monitoreo.
 * Permite filtrar por status (liberados / en ruta / todos) y abrir el detalle.
 */
import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';

const STATUS_META: Record<string, { label: string; icon: string; color: string }> = {
  customs_cleared: { label: 'Liberado de aduana', icon: 'verified', color: '#1976D2' },
  in_transit_clientfinal: { label: 'En tránsito a destino', icon: 'local-shipping', color: '#F05A28' },
};

type FilterKey = 'in_transit_clientfinal' | 'customs_cleared' | 'all';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'in_transit_clientfinal', label: 'En ruta' },
  { key: 'customs_cleared', label: 'Liberados' },
  { key: 'all', label: 'Todos' },
];

export default function MonitorContainersScreen({ navigation, route }: any) {
  const { user, token, mode } = route.params || {};
  const startMode = mode === 'start-monitoring';
  const [filter, setFilter] = useState<FilterKey>('in_transit_clientfinal');
  const [containers, setContainers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/api/monitoreo/containers?status=${filter}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setContainers(Array.isArray(res.data?.containers) ? res.data.containers : []);
    } catch (e: any) {
      console.error('Error cargando contenedores:', e?.response?.data || e.message);
      Alert.alert('Error', 'No se pudieron cargar los contenedores.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, token]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const renderItem = ({ item }: { item: any }) => {
    const meta = STATUS_META[item.status] || { label: item.status, icon: 'directions-boat', color: '#666' };
    const monitoringStarted = !!item.monitoring_started_at;
    const handlePress = () => {
      if (startMode) {
        if (monitoringStarted) {
          Alert.alert('Monitoreo iniciado', 'Este contenedor ya tiene el monitoreo iniciado.');
          return;
        }
        navigation.navigate('StartMonitoring', { user, token, container: item });
        return;
      }
      navigation.navigate('MonitorContainerDetail', { user, token, containerId: item.id });
    };
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.reference}>{item.reference_code || item.container_number || `#${item.id}`}</Text>
          <View style={[styles.statusBadge, { backgroundColor: meta.color + '20' }]}>
            <MaterialIcons name={meta.icon as any} size={14} color={meta.color} />
            <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>
        <View style={styles.row}>
          <MaterialIcons name="person" size={14} color="#888" />
          <Text style={styles.rowText}>
            {item.client_name || 'Cliente sin nombre'}
            {item.client_box_id ? `  ·  ${item.client_box_id}` : ''}
          </Text>
        </View>
        {item.container_number ? (
          <View style={styles.row}>
            <MaterialIcons name="inventory-2" size={14} color="#888" />
            <Text style={styles.rowText}>Contenedor: {item.container_number}</Text>
          </View>
        ) : null}
        {item.driver_name || item.driver_company ? (
          <View style={styles.row}>
            <MaterialIcons name="local-shipping" size={14} color="#888" />
            <Text style={styles.rowText}>
              {[item.driver_company, item.driver_name, item.driver_plates].filter(Boolean).join(' · ')}
            </Text>
          </View>
        ) : (
          <View style={styles.row}>
            <MaterialIcons name="info-outline" size={14} color="#999" />
            <Text style={[styles.rowText, { color: '#999' }]}>Sin ruta asignada</Text>
          </View>
        )}
        {startMode && (
          <View style={[styles.ctaBox, monitoringStarted ? styles.ctaBoxDone : styles.ctaBoxPending]}>
            <MaterialIcons
              name={monitoringStarted ? 'check-circle' : 'photo-camera'}
              size={18}
              color={monitoringStarted ? '#2E7D32' : '#fff'}
            />
            <Text style={[styles.ctaText, { color: monitoringStarted ? '#2E7D32' : '#fff' }]}>
              {monitoringStarted ? 'Monitoreo iniciado' : 'Iniciar monitoreo (subir 2 fotos)'}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title}>{startMode ? 'Iniciar Monitoreo' : 'Contenedores en Ruta'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            onPress={() => { setLoading(true); setFilter(f.key); }}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F05A28" />
        </View>
      ) : (
        <FlatList
          data={containers}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F05A28" />}
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialIcons name="inbox" size={48} color="#bbb" />
              <Text style={styles.emptyText}>No hay contenedores en este filtro</Text>
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
  filters: { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: '#fff' },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16,
    backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#e0e0e0',
  },
  filterChipActive: { backgroundColor: '#F05A28', borderColor: '#F05A28' },
  filterText: { fontSize: 13, color: '#666', fontWeight: '500' },
  filterTextActive: { color: '#fff', fontWeight: '700' },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05,
    shadowRadius: 3, elevation: 1,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  reference: { fontSize: 16, fontWeight: '700', color: '#111' },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  statusText: { fontSize: 11, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  rowText: { fontSize: 13, color: '#555', flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { marginTop: 12, color: '#888', fontSize: 14 },
  ctaBox: {
    marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 8,
  },
  ctaBoxPending: { backgroundColor: '#F05A28' },
  ctaBoxDone: { backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: '#A5D6A7' },
  ctaText: { fontSize: 13, fontWeight: '700' },
});
