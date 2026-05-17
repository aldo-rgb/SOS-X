import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#111111';

const STATUS_LABELS: Record<string, string> = {
  in_transit: 'En tránsito',
  received_china: 'Recibido China',
  received: 'En bodega',
  customs: 'En aduana',
  ready_pickup: 'Listo para recoger',
};

const FILTER_CONFIG: Record<string, { title: string; color: string; icon: string }> = {
  in_transit: { title: 'En Tránsito', color: '#2196F3', icon: 'airplane' },
  awaiting_payment: { title: 'Por Pagar', color: '#FF9800', icon: 'card' },
  missing_instructions: { title: 'Sin Instrucciones', color: '#f44336', icon: 'alert-circle' },
};

export default function AdvisorPackagesScreen({ navigation, route }: any) {
  const { user, token, filter } = route.params;
  const config = FILTER_CONFIG[filter] || FILTER_CONFIG.in_transit;

  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/advisor/packages?filter=${filter}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      console.log('[AdvisorPackages] status:', res.status, 'body:', text.substring(0, 300));
      const data = JSON.parse(text);
      setPackages(data.packages || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.tracking}>{item.tracking_number || `#${item.id}`}</Text>
        <View style={[styles.statusBadge, { backgroundColor: config.color + '20' }]}>
          <Text style={[styles.statusText, { color: config.color }]}>
            {STATUS_LABELS[item.status] || item.status}
          </Text>
        </View>
      </View>
      {item.goods_name ? <Text style={styles.goodsName}>{item.goods_name}</Text> : null}
      <View style={styles.cardFooter}>
        <Text style={styles.clientName}>{item.client_name} · {item.client_box_id}</Text>
        {item.saldo_pendiente > 0 && (
          <Text style={styles.saldo}>${parseFloat(item.saldo_pendiente).toFixed(2)} MXN</Text>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 8 }}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Ionicons name={config.icon as any} size={20} color="#fff" style={{ marginLeft: 4 }} />
        <Text style={styles.headerTitle}>{config.title}</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{packages.length}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={packages}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[ORANGE]} />}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={
            <Text style={styles.empty}>No hay paquetes en esta categoría.</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
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
  tracking: { fontWeight: '700', fontSize: 14, color: BLACK },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 11, fontWeight: '600' },
  goodsName: { fontSize: 12, color: '#555', marginBottom: 6 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  clientName: { fontSize: 12, color: '#888' },
  saldo: { fontSize: 13, fontWeight: '700', color: '#FF9800' },
  empty: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 14 },
});
