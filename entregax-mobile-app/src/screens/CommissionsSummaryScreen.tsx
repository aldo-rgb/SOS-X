// ============================================
// RESUMEN DE COMISIONES POR TIPO DE SERVICIO
// Se abre al tocar el monto de "Comisiones del Mes" en el dashboard del asesor.
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const RED = '#C1272D';

const SERVICE_META: Record<string, { label: string; icon: string }> = {
  pobox_usa_mx:      { label: 'PO Box USA',    icon: '📦' },
  aereo_china_mx:    { label: 'Aéreo China',   icon: '✈️' },
  maritimo_china_mx: { label: 'Marítimo',      icon: '🚢' },
  nacional_mx:       { label: 'Nacional',      icon: '🚚' },
  liberacion_aa_dhl: { label: 'DHL',           icon: '📮' },
  gex_warranty:      { label: 'GEX',           icon: '🛡️' },
  xpay:              { label: 'X-Pay',         icon: '💱' },
};

interface ServiceRow {
  serviceType: string;
  totalCount: number;
  totalVolume: number;
  totalCommission: number;
  pendingCommission: number;
  paidCommission: number;
}

interface Totals {
  totalCommission: number;
  pendingCommission: number;
  paidCommission: number;
  totalCount: number;
}

const fmt = (n: number) =>
  `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CommissionsSummaryScreen({ navigation, route }: any) {
  const { token } = route.params;
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [byService, setByService] = useState<ServiceRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/advisor/commissions?page=1&limit=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const rows: ServiceRow[] = (data.byService || []).map((s: any) => ({
        serviceType: s.serviceType,
        totalCount: Number(s.totalCount) || 0,
        totalVolume: Number(s.totalVolume) || 0,
        totalCommission: Number(s.totalCommission) || 0,
        pendingCommission: Number(s.pendingCommission) || 0,
        paidCommission: Number(s.paidCommission) || 0,
      }));
      rows.sort((a, b) => b.totalCommission - a.totalCommission);
      setByService(rows);
      setTotals(data.totals || null);
    } catch (e) {
      console.error('Error cargando resumen de comisiones:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Resumen de Comisiones</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ORANGE]} tintColor={ORANGE} />}
        >
          {/* Total destacado */}
          <LinearGradient colors={[ORANGE, RED]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total generado</Text>
            <Text style={styles.totalAmount}>{fmt(totals?.totalCommission || 0)}</Text>
            <Text style={styles.totalSub}>MXN · {totals?.totalCount || 0} comisiones</Text>
            <View style={styles.totalSplit}>
              <View style={styles.totalSplitItem}>
                <Text style={styles.totalSplitLabel}>Por cobrar</Text>
                <Text style={styles.totalSplitValue}>{fmt(totals?.pendingCommission || 0)}</Text>
              </View>
              <View style={styles.totalSplitDivider} />
              <View style={styles.totalSplitItem}>
                <Text style={styles.totalSplitLabel}>Pagadas</Text>
                <Text style={styles.totalSplitValue}>{fmt(totals?.paidCommission || 0)}</Text>
              </View>
            </View>
          </LinearGradient>

          <Text style={styles.sectionTitle}>POR TIPO DE SERVICIO</Text>

          {byService.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="cube-outline" size={42} color="#ccc" />
              <Text style={styles.emptyText}>Aún no tienes comisiones generadas</Text>
            </View>
          ) : (
            byService.map((s) => {
              const meta = SERVICE_META[s.serviceType] || { label: s.serviceType, icon: '📦' };
              const pct = totals?.totalCommission ? (s.totalCommission / totals.totalCommission) * 100 : 0;
              return (
                <View key={s.serviceType} style={styles.serviceCard}>
                  <View style={styles.serviceRow}>
                    <View style={styles.serviceIcon}>
                      <Text style={{ fontSize: 20 }}>{meta.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.serviceName}>{meta.label}</Text>
                      <Text style={styles.serviceCount}>{s.totalCount} {s.totalCount === 1 ? 'comisión' : 'comisiones'}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.serviceAmount}>{fmt(s.totalCommission)}</Text>
                      <Text style={styles.servicePct}>{pct.toFixed(0)}%</Text>
                    </View>
                  </View>
                  {/* Barra de proporción */}
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${Math.max(2, Math.min(100, pct))}%` }]} />
                  </View>
                  {/* Pendiente / Pagado */}
                  <View style={styles.serviceFooter}>
                    <View style={styles.footerItem}>
                      <View style={[styles.dot, { backgroundColor: '#F5A623' }]} />
                      <Text style={styles.footerText}>Por cobrar {fmt(s.pendingCommission)}</Text>
                    </View>
                    <View style={styles.footerItem}>
                      <View style={[styles.dot, { backgroundColor: '#2E9E5B' }]} />
                      <Text style={styles.footerText}>Pagado {fmt(s.paidCommission)}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: '#111',
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: { padding: 8, marginRight: 8 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700', flex: 1, textAlign: 'center' },

  totalCard: { borderRadius: 18, padding: 20, marginBottom: 20 },
  totalLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  totalAmount: { color: '#fff', fontSize: 34, fontWeight: '800', marginTop: 2 },
  totalSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  totalSplit: {
    flexDirection: 'row',
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingVertical: 10,
  },
  totalSplitItem: { flex: 1, alignItems: 'center' },
  totalSplitDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.3)' },
  totalSplitLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600' },
  totalSplitValue: { color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 2 },

  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#888', letterSpacing: 0.6, marginBottom: 10 },

  serviceCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, elevation: 1 },
  serviceRow: { flexDirection: 'row', alignItems: 'center' },
  serviceIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: ORANGE + '18',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  serviceName: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  serviceCount: { fontSize: 12, color: '#888', marginTop: 1 },
  serviceAmount: { fontSize: 16, fontWeight: '800', color: ORANGE },
  servicePct: { fontSize: 11, color: '#aaa', marginTop: 1 },

  barTrack: { height: 6, borderRadius: 3, backgroundColor: '#eee', marginTop: 12, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: ORANGE },

  serviceFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  footerItem: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  footerText: { fontSize: 12, color: '#555', fontWeight: '500' },

  emptyBox: { alignItems: 'center', paddingVertical: 50 },
  emptyText: { color: '#999', marginTop: 10, fontSize: 14 },
});
