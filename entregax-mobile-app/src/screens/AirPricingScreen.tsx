import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';

const ORANGE = '#F05A28';

// Márgenes automáticos sobre el Costo de Ruta (igual que la web):
// Logo = costo + $9 · Genérico = costo + $8 · Flat = costo + $7 · Sensible = manual.
const MARKUPS: Record<'L' | 'G' | 'S' | 'F', number | null> = { L: 9, G: 8, S: null, F: 7 };

const TARIFF_TYPES: { key: 'L' | 'G' | 'S' | 'F'; label: string; color: string }[] = [
  { key: 'L', label: 'Logo', color: '#1565C0' },
  { key: 'G', label: 'Genérico', color: '#2E7D32' },
  { key: 'S', label: 'Sensible', color: '#E65100' },
  { key: 'F', label: 'Flat', color: '#6A1B9A' },
];

interface RouteTariff {
  id: number;
  code: string;
  name: string;
  origin_city?: string;
  destination_city?: string;
  origin_airport?: string;
  destination_airport?: string;
  cost_per_kg_usd: number | null;
  is_active: boolean;
  tariffs: Record<string, { id: number | null; price_per_kg: number; is_active: boolean }>;
}

export default function AirPricingScreen({ navigation, route }: any) {
  const { token } = route.params;
  const insets = useSafeAreaInsets();
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const [routes, setRoutes] = useState<RouteTariff[]>([]);
  // Solo el costo de ruta es editable (string por ruta). El resto se calcula.
  const [costDrafts, setCostDrafts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const res = await api.get('/api/admin/air-tariffs', auth);
      const list: RouteTariff[] = res.data?.routes || [];
      setRoutes(list);
      const cmap: Record<number, string> = {};
      list.forEach(r => { cmap[r.id] = r.cost_per_kg_usd != null ? String(r.cost_per_kg_usd) : ''; });
      setCostDrafts(cmap);
    } catch (e: any) {
      Alert.alert('Error', 'No se pudieron cargar las tarifas aéreas.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(true); }, []);

  const onRefresh = () => { setRefreshing(true); load(false); };

  const setCost = (routeId: number, value: string) => {
    const clean = value.replace(/[^0-9.]/g, '');
    setCostDrafts(prev => ({ ...prev, [routeId]: clean }));
  };

  // Tarifa calculada por tipo: costo + margen. Sensible (margen null) = valor manual guardado.
  const computedTariff = (r: RouteTariff, cost: number, key: 'L' | 'G' | 'S' | 'F'): number => {
    const mk = MARKUPS[key];
    if (mk == null) return Number(r.tariffs?.[key]?.price_per_kg || 0); // manual
    return cost + mk;
  };

  const save = async (r: RouteTariff) => {
    const raw = costDrafts[r.id];
    if (raw === undefined || raw === '') { Alert.alert('Falta el costo', 'Ingresa el costo de ruta.'); return; }
    const cost = parseFloat(raw) || 0;
    setSavingId(r.id);
    try {
      // Enviar costo + tarifas recalculadas automáticamente (Sensible se mantiene manual).
      const tariffs: Record<string, number> = {};
      for (const t of TARIFF_TYPES) tariffs[t.key] = computedTariff(r, cost, t.key);
      await api.post('/api/admin/air-tariffs', { route_id: r.id, cost_per_kg_usd: cost, tariffs }, auth);
      Alert.alert('Guardado', `✅ Costo y tarifas de ${r.code} actualizados.`);
      await load(false);
    } catch (e: any) {
      Alert.alert('No se pudo guardar', e?.response?.data?.error || 'Error al guardar las tarifas.');
    } finally {
      setSavingId(null);
    }
  };

  const routeLabel = (r: RouteTariff) => {
    const o = r.origin_airport || r.origin_city || '';
    const dst = r.destination_airport || r.destination_city || '';
    return o && dst ? `${o} → ${dst}` : (r.name || r.code);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Tarifas Aéreo China</Text>
          <Text style={styles.headerSub}>TDI Aéreo / TDI Express · USD/kg</Text>
        </View>
        <Ionicons name="airplane-outline" size={22} color="#fff" />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 48 }} />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ORANGE]} />}
          >
            <Text style={styles.help}>Solo edita el <Text style={{ fontWeight: '800' }}>Costo de Ruta</Text>. Las tarifas por tipo se calculan automáticamente (costo + margen): Logo +$9, Genérico +$8, Flat +$7. Sensible es manual. El "Genérico" (G) es el precio que ven los asesores.</Text>
            {routes.map(r => {
              const raw = costDrafts[r.id] ?? '';
              const cost = parseFloat(raw) || 0;
              const isExpress = r.code === 'TDI-EXPRES';
              return (
                <View key={r.id} style={styles.card}>
                  <View style={styles.cardHead}>
                    <View style={[styles.badge, { backgroundColor: isExpress ? '#7B1FA2' : '#1976D2' }]}>
                      <Text style={styles.badgeTxt}>{isExpress ? 'TDI Express' : 'TDI Aéreo'}</Text>
                    </View>
                    {!r.is_active && <Text style={styles.inactive}>inactiva</Text>}
                  </View>
                  <Text style={styles.routeCode}>{r.code}</Text>
                  <Text style={styles.routeName}>{routeLabel(r)}</Text>

                  {/* Único campo editable */}
                  <View style={styles.fieldRow}>
                    <Text style={styles.fieldLblBold}>Costo de ruta (USD/kg)</Text>
                    <TextInput
                      style={[styles.numInput, styles.numInputEdit]}
                      value={raw}
                      onChangeText={v => setCost(r.id, v)}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor="#bbb"
                    />
                  </View>

                  <Text style={styles.calcHint}>Tarifas calculadas (solo lectura)</Text>
                  {TARIFF_TYPES.map(t => {
                    const isManual = MARKUPS[t.key] == null;
                    const val = computedTariff(r, cost, t.key);
                    return (
                      <View key={t.key} style={styles.fieldRow}>
                        <View style={styles.tariffLbl}>
                          <View style={[styles.dot, { backgroundColor: t.color }]} />
                          <Text style={styles.fieldLbl}>{t.label} ({t.key}){isManual ? ' · manual' : ` · +$${MARKUPS[t.key]}`}</Text>
                        </View>
                        <View style={[styles.numInput, styles.numInputRO]}>
                          <Text style={styles.numInputROTxt}>${val.toFixed(2)}</Text>
                        </View>
                      </View>
                    );
                  })}

                  <TouchableOpacity
                    style={[styles.saveBtn, savingId === r.id && { opacity: 0.6 }]}
                    onPress={() => save(r)}
                    disabled={savingId === r.id}
                  >
                    {savingId === r.id ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveTxt}>Guardar {r.code}</Text>}
                  </TouchableOpacity>
                </View>
              );
            })}
            {routes.length === 0 && <Text style={styles.empty}>No hay rutas aéreas configuradas.</Text>}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F5F7' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: ORANGE, paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { padding: 4 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub: { color: '#ffe', fontSize: 12, opacity: 0.9 },
  help: { fontSize: 12, color: '#666', marginBottom: 14, lineHeight: 17 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#ececef' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  inactive: { color: '#c00', fontSize: 11, fontWeight: '700' },
  routeCode: { fontSize: 16, fontWeight: '800', color: '#111', marginTop: 8 },
  routeName: { fontSize: 13, color: '#777', marginBottom: 8 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  tariffLbl: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  fieldLbl: { fontSize: 14, color: '#333', fontWeight: '600' },
  fieldLblBold: { fontSize: 15, color: '#111', fontWeight: '800' },
  numInput: { width: 110, backgroundColor: '#f7f7f9', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111', borderWidth: 1, borderColor: '#e3e3e6', textAlign: 'right' },
  numInputEdit: { backgroundColor: '#FFF3EC', borderColor: ORANGE, borderWidth: 1.5 },
  numInputRO: { backgroundColor: '#f2f2f4', justifyContent: 'center', alignItems: 'flex-end' },
  numInputROTxt: { fontSize: 15, color: '#555', fontWeight: '700' },
  calcHint: { fontSize: 12, color: '#999', fontWeight: '700', marginTop: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  saveBtn: { marginTop: 16, backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  saveTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
});
