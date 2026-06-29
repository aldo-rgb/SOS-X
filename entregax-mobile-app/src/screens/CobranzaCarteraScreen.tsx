/**
 * CobranzaCarteraScreen
 * Resumen de cartera pendiente / guías pendientes (solo lectura).
 * GET /api/admin/finance/cartera-pendiente
 *  - mode 'cartera': resumen por cliente (monto adeudado)
 *  - mode 'guias':   lista de guías pendientes
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator,
  RefreshControl, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BG = '#F4F6F8';
const RED = '#C62828';
const AMBER = '#B26A00';

const money = (n: number) => `$${(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SERVICE_LABEL: Record<string, string> = {
  POBOX_USA: 'PO Box USA', usa_pobox: 'PO Box USA', pobox: 'PO Box USA',
  AIR_CHN_MX: 'Aéreo China', china_air: 'Aéreo China', aereo: 'Aéreo China',
  SEA_CHN_MX: 'Marítimo China', china_sea: 'Marítimo China', maritime: 'Marítimo',
  AA_DHL: 'Nacional DHL', mx_cedis: 'Nacional DHL', dhl: 'DHL',
};

interface Cliente { user_id: number | null; box_id: string | null; cliente: string; total_saldo: number; guias_count: number; }
interface Guia {
  id: number; tracking_interno: string; descripcion: string; service_type: string | null;
  payment_status: string; costo: number; saldo: number; box_id: string | null; cliente: string;
}

export default function CobranzaCarteraScreen({ navigation, route }: any) {
  const { token, mode } = route.params as { token: string; mode: 'cartera' | 'guias' };
  const isCartera = mode === 'cartera';
  const accent = isCartera ? RED : AMBER;

  const [porCliente, setPorCliente] = useState<Cliente[]>([]);
  const [guias, setGuias] = useState<Guia[]>([]);
  const [totalCartera, setTotalCartera] = useState(0);
  const [totalGuias, setTotalGuias] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/finance/cartera-pendiente`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setPorCliente(data.por_cliente || []);
        setGuias(data.guias || []);
        setTotalCartera(data.total_cartera || 0);
        setTotalGuias(data.total_guias || 0);
      }
    } catch (e) {
      console.error('Error cartera pendiente:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const renderCliente = ({ item }: { item: Cliente }) => (
    <View style={styles.row}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title} numberOfLines={1}>
          {item.box_id ? `${item.box_id} · ` : ''}{item.cliente}
        </Text>
        <Text style={styles.meta}>{item.guias_count} {item.guias_count === 1 ? 'guía' : 'guías'}</Text>
      </View>
      <Text style={[styles.amount, { color: RED }]}>{money(item.total_saldo)}</Text>
    </View>
  );

  const renderGuia = ({ item }: { item: Guia }) => (
    <View style={styles.row}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title} numberOfLines={1}>{item.tracking_interno}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {item.box_id ? `${item.box_id} · ` : ''}{item.cliente}
          {item.service_type ? ` · ${SERVICE_LABEL[item.service_type] || item.service_type}` : ''}
        </Text>
        <Text style={styles.desc} numberOfLines={1}>{item.descripcion}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.amount, { color: AMBER }]}>{money(item.saldo)}</Text>
        {item.costo !== item.saldo && <Text style={styles.costoSub}>de {money(item.costo)}</Text>}
        <Text style={styles.statusTxt}>{item.payment_status === 'partial' ? 'Parcial' : 'Pendiente'}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={ORANGE} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{isCartera ? 'Cartera vencida' : 'Guías pendientes'}</Text>
          <Text style={styles.headerSub}>{isCartera ? 'Adeudo por cliente' : 'Guías por cobrar'}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
      ) : (
        <FlatList
          data={isCartera ? (porCliente as any[]) : (guias as any[])}
          keyExtractor={(it: any) => isCartera ? `c-${it.user_id ?? it.box_id}` : `g-${it.id}`}
          renderItem={isCartera ? (renderCliente as any) : (renderGuia as any)}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
          ListHeaderComponent={(
            <View style={[styles.totalCard, { borderLeftColor: accent }]}>
              <Text style={styles.totalLbl}>{isCartera ? 'Total cartera vencida' : 'Total guías pendientes'}</Text>
              <Text style={[styles.totalVal, { color: accent }]}>
                {isCartera ? money(totalCartera) : String(totalGuias)}
              </Text>
              <Text style={styles.totalSub}>
                {isCartera ? `${totalGuias} guías · ${porCliente.length} clientes` : `${money(totalCartera)} por cobrar`}
              </Text>
            </View>
          )}
          ListEmptyComponent={(
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-circle-outline" size={48} color="#9CCC65" />
              <Text style={styles.emptyTxt}>Sin {isCartera ? 'cartera' : 'guías'} pendientes</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { backgroundColor: ORANGE, paddingHorizontal: 8, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 4 },
  back: { padding: 4 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  totalCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderLeftWidth: 4 },
  totalLbl: { fontSize: 12, color: '#666', fontWeight: '600' },
  totalVal: { fontSize: 26, fontWeight: '900', marginTop: 4 },
  totalSub: { fontSize: 12, color: '#999', marginTop: 2 },
  row: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 13, fontWeight: '800', color: '#222' },
  meta: { fontSize: 11, color: '#777', marginTop: 2 },
  desc: { fontSize: 11, color: '#999', marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '800' },
  costoSub: { fontSize: 10, color: '#999', marginTop: 1 },
  statusTxt: { fontSize: 10, color: AMBER, fontWeight: '700', marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTxt: { color: '#888', fontSize: 14 },
});
