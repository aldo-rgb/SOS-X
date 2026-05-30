/**
 * BranchInventoryReportScreen
 * -----------------------------------------------------------
 * Informe directivo (read-only) del inventario en bodega por sucursal.
 * Destinado a roles admin / super_admin / director: muestra conteos
 * por servicio (PO Box, Marítimo, Aéreo, DHL), peso total, número
 * de clientes únicos, última recepción y consejos operativos
 * por sucursal. No expone paquetes individuales.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { API_URL } from '../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'BranchInventoryReport'>;

interface ServiceStats {
  packages: number;
  weight_kg: number;
  unique_clients: number;
}

interface BranchRow {
  id: number;
  name: string;
  code: string;
  city: string | null;
  allowed_services: string[];
  total_packages: number;
  total_weight_kg: number;
  last_received_at: string | null;
  services: {
    pobox: ServiceStats;
    maritimo: ServiceStats;
    aereo: ServiceStats;
    dhl: ServiceStats;
  };
  tips: string[];
}

const ORANGE = '#F05A28';
const BG = '#F4F6F8';

const SERVICE_META: Array<{ key: keyof BranchRow['services']; label: string; icon: any; color: string }> = [
  { key: 'pobox',    label: 'PO Box USA',     icon: 'mail-outline',     color: '#F05A28' },
  { key: 'maritimo', label: 'Marítimo China', icon: 'boat-outline',     color: '#0277BD' },
  { key: 'aereo',    label: 'Aéreo China',    icon: 'airplane-outline', color: '#1976D2' },
  { key: 'dhl',      label: 'DHL Nacional',   icon: 'business-outline', color: '#FFC107' },
];

const formatDate = (iso: string | null) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm} ${hh}:${min}`;
  } catch { return '—'; }
};

export default function BranchInventoryReportScreen({ navigation, route }: Props) {
  const { token } = route.params;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`${API_URL}/api/admin/branches/inventory-report`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setBranches(data.branches || []);
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar el informe');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const toggle = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Totales agregados (vista directiva)
  const totals = branches.reduce(
    (acc, b) => {
      acc.packages += b.total_packages;
      acc.weight += b.total_weight_kg;
      (Object.keys(b.services) as Array<keyof BranchRow['services']>).forEach(k => {
        acc.byService[k] += b.services[k].packages;
      });
      return acc;
    },
    { packages: 0, weight: 0, byService: { pobox: 0, maritimo: 0, aereo: 0, dhl: 0 } as Record<string, number> }
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={ORANGE} />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Inventario por Sucursal</Text>
          <Text style={styles.headerSubtitle}>Informe directivo · solo lectura</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.headerBtn} hitSlop={10}>
          <Ionicons name="refresh" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ORANGE} />
          <Text style={styles.muted}>Generando informe…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={42} color="#D32F2F" />
          <Text style={{ color: '#D32F2F', marginTop: 8 }}>{error}</Text>
          <TouchableOpacity onPress={load} style={styles.retryBtn}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
        >
          {/* Resumen ejecutivo */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>📊 Resumen Global</Text>
            <View style={styles.summaryRow}>
              <View style={styles.summaryCol}>
                <Text style={styles.summaryNum}>{totals.packages}</Text>
                <Text style={styles.summaryLbl}>Paquetes en bodega</Text>
              </View>
              <View style={styles.summaryCol}>
                <Text style={styles.summaryNum}>{totals.weight.toFixed(0)} kg</Text>
                <Text style={styles.summaryLbl}>Peso total</Text>
              </View>
              <View style={styles.summaryCol}>
                <Text style={styles.summaryNum}>{branches.length}</Text>
                <Text style={styles.summaryLbl}>Sucursales activas</Text>
              </View>
            </View>
            <View style={styles.svcGrid}>
              {SERVICE_META.map(s => (
                <View key={s.key} style={styles.svcChip}>
                  <Ionicons name={s.icon} size={14} color={s.color} />
                  <Text style={[styles.svcChipTxt, { color: s.color }]}>
                    {s.label}: {totals.byService[s.key]}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Cards por sucursal */}
          {branches.map(b => {
            const isOpen = expanded.has(b.id);
            const isEmpty = b.total_packages === 0;
            return (
              <View key={b.id} style={styles.branchCard}>
                <TouchableOpacity onPress={() => toggle(b.id)} activeOpacity={0.7} style={styles.branchHead}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="business" size={18} color={ORANGE} />
                      <Text style={styles.branchName}>{b.name}</Text>
                      <View style={styles.codeBadge}><Text style={styles.codeBadgeTxt}>{b.code}</Text></View>
                    </View>
                    {!!b.city && <Text style={styles.branchCity}>{b.city}</Text>}
                    <Text style={styles.branchTotals}>
                      {b.total_packages} paquetes · {b.total_weight_kg.toFixed(1)} kg · última: {formatDate(b.last_received_at)}
                    </Text>
                  </View>
                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={22} color="#666" />
                </TouchableOpacity>

                {isOpen && (
                  <View style={styles.branchBody}>
                    {/* Servicios */}
                    <Text style={styles.sectionLabel}>Inventario por servicio</Text>
                    <View style={{ gap: 8 }}>
                      {SERVICE_META.map(s => {
                        const v = b.services[s.key];
                        return (
                          <View key={s.key} style={[styles.svcRow, v.packages === 0 && { opacity: 0.45 }]}>
                            <View style={[styles.svcIcon, { backgroundColor: s.color + '22' }]}>
                              <Ionicons name={s.icon} size={18} color={s.color} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.svcLbl}>{s.label}</Text>
                              <Text style={styles.svcMeta}>
                                {v.packages} paq · {v.weight_kg.toFixed(1)} kg · {v.unique_clients} clientes
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>

                    {isEmpty && (
                      <View style={styles.emptyHint}>
                        <Ionicons name="information-circle-outline" size={16} color="#888" />
                        <Text style={styles.emptyHintTxt}>Sin inventario activo en este momento.</Text>
                      </View>
                    )}

                    {/* Tips */}
                    <Text style={[styles.sectionLabel, { marginTop: 14 }]}>💡 Consejos operativos</Text>
                    {b.tips.map((tip, i) => (
                      <View key={i} style={styles.tipRow}>
                        <Text style={styles.tipBullet}>•</Text>
                        <Text style={styles.tipTxt}>{tip}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}

          {branches.length === 0 && (
            <View style={styles.center}>
              <Ionicons name="folder-open-outline" size={42} color="#999" />
              <Text style={styles.muted}>No hay sucursales activas.</Text>
            </View>
          )}

          <Text style={styles.footer}>
            Datos actualizados al momento de cargar. Desliza hacia abajo para refrescar.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: {
    backgroundColor: ORANGE, paddingHorizontal: 12, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  headerBtn: { padding: 6 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  headerSubtitle: { color: '#FFE0D2', fontSize: 12, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: '#888', marginTop: 8 },
  retryBtn: { backgroundColor: ORANGE, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, marginTop: 12 },

  summaryCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 14,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  summaryTitle: { fontSize: 15, fontWeight: '700', color: '#222', marginBottom: 10 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 },
  summaryCol: { alignItems: 'center', flex: 1 },
  summaryNum: { fontSize: 22, fontWeight: '700', color: ORANGE },
  summaryLbl: { fontSize: 11, color: '#666', textAlign: 'center', marginTop: 2 },
  svcGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  svcChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F4F6F8', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 14,
  },
  svcChipTxt: { fontSize: 11, fontWeight: '600' },

  branchCard: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 10, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  branchHead: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 8 },
  branchName: { fontSize: 15, fontWeight: '700', color: '#222' },
  codeBadge: { backgroundColor: '#FFE0D2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  codeBadgeTxt: { color: ORANGE, fontSize: 11, fontWeight: '700' },
  branchCity: { fontSize: 12, color: '#666', marginTop: 4 },
  branchTotals: { fontSize: 12, color: '#444', marginTop: 4, fontWeight: '500' },
  branchBody: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#E5E5E5', padding: 14 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#666', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.4 },

  svcRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  svcIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  svcLbl: { fontSize: 14, fontWeight: '600', color: '#222' },
  svcMeta: { fontSize: 12, color: '#666', marginTop: 2 },

  emptyHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  emptyHintTxt: { fontSize: 12, color: '#888', fontStyle: 'italic' },

  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 6 },
  tipBullet: { color: ORANGE, fontWeight: '700', fontSize: 14, lineHeight: 18 },
  tipTxt: { flex: 1, fontSize: 13, color: '#444', lineHeight: 18 },

  footer: { textAlign: 'center', color: '#999', fontSize: 11, marginTop: 16 },
});
