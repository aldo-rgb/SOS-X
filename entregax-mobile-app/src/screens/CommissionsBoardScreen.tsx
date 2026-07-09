import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  RefreshControl, Modal, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const GREEN = '#2e7d32';
const BLUE = '#1565c0';
const PODIUM = ['#FFD700', '#C0C0C0', '#CD7F32'];

const SERVICE_LABELS: Record<string, string> = {
  pobox_usa_mx: '📦 PO Box USA',
  aereo_china_mx: '✈️ Aéreo China',
  maritimo_china_mx: '🚢 Marítimo',
  nacional_mx: '🚚 Nacional',
  liberacion_aa_dhl: '📮 DHL',
  gex_warranty: '🛡️ GEX',
  xpay: '💱 X-Pay',
};
const SERVICE_OPTIONS = [{ value: '', label: 'Todos los servicios' }, ...Object.entries(SERVICE_LABELS).map(([value, label]) => ({ value, label }))];

const money = (n: any) => `$${(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pad = (n: number) => String(n).padStart(2, '0');
const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const initials = (name: string) => (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

interface Row {
  advisorId: number; advisorName: string; leaderName: string | null; leaderId: number | null;
  photoUrl: string | null; referralCode: string | null; totalCount: number;
  totalCommission: number; pendingCommission: number; paidCommission: number;
  ownTotal: number; ownPending: number; ownPaid: number;
  overrideTotal: number; overridePending: number; overridePaid: number;
  subCount: number;
}

type Props = NativeStackScreenProps<RootStackParamList, 'CommissionsBoard'>;

export default function CommissionsBoardScreen({ navigation, route }: Props) {
  const { user, token } = route.params as any;

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<'pending' | 'paid' | 'all'>('pending');
  const [service, setService] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [preset, setPreset] = useState<'all' | 'month' | 'lastmonth' | 'week'>('all');
  const [svcModal, setSvcModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (fromDate) qs.append('from_date', fromDate);
      if (toDate) qs.append('to_date', toDate);
      if (service) qs.append('service_type', service);
      const res = await fetch(`${API_URL}/api/admin/commissions/by-advisor?${qs.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch { setRows([]); }
    setLoading(false); setRefreshing(false);
  }, [token, fromDate, toDate, service]);

  useEffect(() => { load(); }, [load]);

  const applyPreset = (key: 'all' | 'month' | 'lastmonth' | 'week') => {
    setPreset(key);
    const now = new Date();
    if (key === 'all') { setFromDate(''); setToDate(''); return; }
    if (key === 'month') { setFromDate(isoLocal(new Date(now.getFullYear(), now.getMonth(), 1))); setToDate(''); return; }
    if (key === 'lastmonth') { setFromDate(isoLocal(new Date(now.getFullYear(), now.getMonth() - 1, 1))); setToDate(isoLocal(new Date(now.getFullYear(), now.getMonth(), 0))); return; }
    // Semana viernes → jueves (última semana cerrada)
    const end = new Date(now); end.setDate(end.getDate() - ((end.getDay() - 4 + 7) % 7));
    const start = new Date(end); start.setDate(start.getDate() - 6);
    setFromDate(isoLocal(start)); setToDate(isoLocal(end));
  };

  const { display, trophyById, kpis } = useMemo(() => {
    const met = (r: Row) => (status === 'paid' ? r.paidCommission : r.pendingCommission);
    const filtered = rows.filter((r) => {
      if (status === 'pending') return r.pendingCommission > 0;
      if (status === 'paid') return r.paidCommission > 0;
      return r.pendingCommission > 0 || r.totalCommission > 0;
    });
    const byId = new Map(filtered.map((r) => [r.advisorId, r]));
    const subsByLeader = new Map<number, Row[]>();
    const topLevel: Row[] = [];
    for (const r of filtered) {
      if (r.leaderId && byId.has(r.leaderId)) {
        const arr = subsByLeader.get(r.leaderId) || []; arr.push(r); subsByLeader.set(r.leaderId, arr);
      } else topLevel.push(r);
    }
    topLevel.sort((a, b) => met(b) - met(a) || b.totalCommission - a.totalCommission);
    const out: { row: Row; isSub: boolean }[] = [];
    const appendWithSubs = (r: Row, isSub: boolean) => {
      out.push({ row: r, isSub });
      const subs = (subsByLeader.get(r.advisorId) || []).slice().sort((a, b) => met(b) - met(a));
      for (const s of subs) appendWithSubs(s, true);
    };
    for (const r of topLevel) appendWithSubs(r, false);
    const trophyById = new Map<number, number>();
    [...filtered].sort((a, b) => met(b) - met(a)).slice(0, 3).forEach((r, i) => trophyById.set(r.advisorId, i));
    const kpis = {
      pending: out.reduce((s, x) => s + x.row.pendingCommission, 0),
      paid: out.reduce((s, x) => s + x.row.paidCommission, 0),
      total: out.reduce((s, x) => s + x.row.totalCommission, 0),
      advisors: out.length,
    };
    return { display: out, trophyById, kpis };
  }, [rows, status]);

  const metricLabel = status === 'paid' ? 'Comisión pagada' : 'Comisión por pagar';
  const photoSrc = (url: string | null) => (url ? (url.startsWith('http') ? url : `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`) : null);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 12 }}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Comisiones</Text>
          <Text style={styles.subtitle}>Tablero general de asesores</Text>
        </View>
        <TouchableOpacity onPress={() => { setRefreshing(true); load(); }}>
          <Ionicons name="refresh" size={22} color={ORANGE} />
        </TouchableOpacity>
      </View>

      {/* Toggle General / Generadas */}
      <View style={styles.topTabs}>
        <View style={[styles.topTab, styles.topTabActive]}>
          <Text style={[styles.topTabText, styles.topTabTextActive]}>General</Text>
        </View>
        <TouchableOpacity style={styles.topTab} onPress={() => navigation.navigate('Commissions', { user, token })}>
          <Text style={styles.topTabText}>Generadas</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 50 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={ORANGE} />}
        >
          {/* KPIs */}
          <View style={styles.kpiGrid}>
            <View style={[styles.kpi, { backgroundColor: ORANGE }]}>
              <Text style={styles.kpiLabelW}>Por pagar</Text>
              <Text style={styles.kpiValW}>{money(kpis.pending)}</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>Pagada</Text>
              <Text style={[styles.kpiVal, { color: GREEN }]}>{money(kpis.paid)}</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>Total</Text>
              <Text style={[styles.kpiVal, { color: BLUE }]}>{money(kpis.total)}</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>Asesores</Text>
              <Text style={[styles.kpiVal, { color: '#111' }]}>{kpis.advisors}</Text>
            </View>
          </View>

          {/* Estado */}
          <View style={styles.segment}>
            {([['pending', 'Pendientes'], ['paid', 'Pagadas'], ['all', 'Todas']] as const).map(([k, lbl]) => (
              <TouchableOpacity key={k} style={[styles.segBtn, status === k && styles.segBtnActive]} onPress={() => setStatus(k)}>
                <Text style={[styles.segText, status === k && styles.segTextActive]}>{lbl}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Servicio */}
          <TouchableOpacity style={styles.svcBtn} onPress={() => setSvcModal(true)}>
            <Ionicons name="funnel-outline" size={16} color="#555" />
            <Text style={styles.svcText}>{SERVICE_OPTIONS.find((o) => o.value === service)?.label || 'Todos los servicios'}</Text>
            <Ionicons name="chevron-down" size={16} color="#888" />
          </TouchableOpacity>

          {/* Presets fecha */}
          <View style={styles.presets}>
            {([['all', 'Todo'], ['month', 'Este mes'], ['lastmonth', 'Mes anterior'], ['week', 'Semana vie–jue']] as const).map(([k, lbl]) => (
              <TouchableOpacity key={k} style={[styles.presetChip, preset === k && styles.presetChipActive]} onPress={() => applyPreset(k)}>
                <Text style={[styles.presetText, preset === k && styles.presetTextActive]}>{lbl}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Cards */}
          {display.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="briefcase-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>Sin comisiones para los filtros seleccionados</Text>
            </View>
          ) : display.map(({ row: r, isSub }) => {
            const metricVal = status === 'paid' ? r.paidCommission : r.pendingCommission;
            const ownMetric = status === 'paid' ? r.ownPaid : r.ownPending;
            const ovMetric = status === 'paid' ? r.overridePaid : r.overridePending;
            const trophy = trophyById.get(r.advisorId);
            const img = photoSrc(r.photoUrl);
            return (
              <View key={r.advisorId} style={[styles.card, isSub && styles.cardSub]}>
                <View style={styles.cardTop}>
                  <View style={styles.avatarWrap}>
                    {img ? <Image source={{ uri: img }} style={styles.avatar} /> : (
                      <View style={[styles.avatar, styles.avatarFallback, isSub && { backgroundColor: '#9ca3af' }]}><Text style={styles.avatarTxt}>{initials(r.advisorName)}</Text></View>
                    )}
                    {trophy != null && (
                      <View style={[styles.trophy, { backgroundColor: PODIUM[trophy] }]}>
                        <Ionicons name="trophy" size={11} color="#fff" />
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{isSub ? '↳ ' : ''}{r.advisorName}</Text>
                    <Text style={styles.role} numberOfLines={1}>
                      {r.subCount > 0 ? `Líder de ${r.subCount} subasesor(es)` : (r.leaderName ? `Líder: ${r.leaderName}` : (r.referralCode ? `Ref: ${r.referralCode}` : 'Asesor'))}
                    </Text>
                  </View>
                  <Text style={styles.guides}>{r.totalCount} guía{r.totalCount !== 1 ? 's' : ''}</Text>
                </View>

                {r.subCount > 0 && (
                  <View style={styles.breakdown}>
                    <View style={[styles.bChip, { backgroundColor: '#FFF3E0' }]}><Text style={[styles.bChipText, { color: '#e65100' }]}>Propia: {money(ownMetric)}</Text></View>
                    <View style={[styles.bChip, { backgroundColor: '#EDE7F6' }]}><Text style={[styles.bChipText, { color: '#5e35b1' }]}>Subasesores: {money(ovMetric)}</Text></View>
                  </View>
                )}

                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>{metricLabel}</Text>
                  <Text style={[styles.metricVal, { color: status === 'paid' ? GREEN : ORANGE }]}>{money(metricVal)}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Modal servicio */}
      <Modal visible={svcModal} transparent animationType="fade" onRequestClose={() => setSvcModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSvcModal(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Servicio</Text>
            {SERVICE_OPTIONS.map((o) => (
              <TouchableOpacity key={o.value || 'all'} style={styles.modalItem} onPress={() => { setService(o.value); setSvcModal(false); }}>
                <Text style={[styles.modalItemText, service === o.value && { color: ORANGE, fontWeight: '700' }]}>{o.label}</Text>
                {service === o.value ? <Ionicons name="checkmark" size={18} color={ORANGE} /> : null}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  title: { fontSize: 18, fontWeight: '800', color: '#111' },
  subtitle: { fontSize: 12, color: '#6b7280' },
  topTabs: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  topTab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: '#f3f4f6' },
  topTabActive: { backgroundColor: ORANGE },
  topTabText: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
  topTabTextActive: { color: '#fff' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  kpi: { flexBasis: '48%', flexGrow: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#eee' },
  kpiLabel: { fontSize: 11, color: '#6b7280', fontWeight: '600' },
  kpiVal: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  kpiLabelW: { fontSize: 11, color: '#fff', opacity: 0.9, fontWeight: '600' },
  kpiValW: { fontSize: 18, fontWeight: '800', marginTop: 2, color: '#fff' },
  segment: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 4, borderWidth: 1, borderColor: '#eee', marginBottom: 10 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9 },
  segBtnActive: { backgroundColor: ORANGE },
  segText: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
  segTextActive: { color: '#fff' },
  svcBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, borderWidth: 1, borderColor: '#eee', marginBottom: 10 },
  svcText: { flex: 1, fontSize: 14, color: '#111', fontWeight: '600' },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  presetChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' },
  presetChipActive: { backgroundColor: '#111', borderColor: '#111' },
  presetText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  presetTextActive: { color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#eee' },
  cardSub: { marginLeft: 16, borderLeftWidth: 3, borderLeftColor: '#c7b3e6' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarWrap: { width: 46, height: 46 },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: { backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
  trophy: { position: 'absolute', top: -3, right: -3, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fff' },
  name: { fontSize: 15, fontWeight: '700', color: '#111' },
  role: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  guides: { fontSize: 11, color: '#9ca3af', fontWeight: '600' },
  breakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  bChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  bChipText: { fontSize: 11, fontWeight: '700' },
  metricRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  metricLabel: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  metricVal: { fontSize: 20, fontWeight: '800' },
  empty: { alignItems: 'center', paddingTop: 40, gap: 12 },
  emptyText: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, paddingVertical: 8 },
  modalTitle: { fontSize: 15, fontWeight: '700', color: '#111', paddingHorizontal: 16, paddingVertical: 10 },
  modalItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  modalItemText: { fontSize: 14, color: '#374151' },
});
