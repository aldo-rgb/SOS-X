/**
 * CommissionsScreen
 * -----------------------------------------------------------
 * Módulo de Comisiones para super_admin / admin / director.
 * Replica el ledger "Comisiones Generadas" del Panel Web:
 *   - Lista paginada con filtros: estado, servicio, rango fechas.
 *   - Resumen: pendiente, pagado, asesores únicos.
 *   - Selección múltiple para marcar como PAGADAS.
 *
 * Las tarifas y la jerarquía de asesores siguen en Web.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  StatusBar,
  FlatList,
  RefreshControl,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { API_URL } from '../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'Commissions'>;

const ORANGE = '#F05A28';
const BG = '#F4F6F8';

interface CommissionRow {
  id: number;
  advisorId: number;
  advisorName: string;
  leaderName?: string | null;
  serviceType: string;
  tracking: string;
  clientName: string;
  paymentAmount: number;
  commissionRate: number;
  commissionAmount: number;
  status: 'pending' | 'paid';
  paidAt?: string | null;
  createdAt: string;
}

interface Summary {
  totalCount: number;
  totalCommission: number;
  pendingTotal: number;
  paidTotal: number;
  advisorCount: number;
}

type StatusFilter = 'all' | 'pending' | 'paid';

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'pending', label: 'Pendientes' },
  { key: 'paid', label: 'Pagadas' },
  { key: 'all', label: 'Todas' },
];

const SERVICE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: '', label: 'Todos los servicios' },
  { key: 'pobox_usa_mx', label: 'PO Box USA' },
  { key: 'aereo_china_mx', label: 'Aéreo China' },
  { key: 'maritimo_china_mx', label: 'Marítimo China' },
  { key: 'nacional_mx', label: 'Nacional MX' },
  { key: 'liberacion_aa_dhl', label: 'Liberación / DHL' },
  { key: 'gex_warranty', label: 'GEX Garantía' },
];

const SERVICE_LABEL: Record<string, string> = SERVICE_OPTIONS.reduce((acc, s) => {
  if (s.key) acc[s.key] = s.label;
  return acc;
}, {} as Record<string, string>);

const serviceIcon = (svc: string): keyof typeof Ionicons.glyphMap => {
  if (svc.includes('aereo')) return 'airplane-outline';
  if (svc.includes('maritimo')) return 'boat-outline';
  if (svc.includes('pobox') || svc.includes('usa')) return 'cube-outline';
  if (svc.includes('nacional')) return 'car-outline';
  if (svc.includes('dhl')) return 'paper-plane-outline';
  if (svc.includes('gex')) return 'shield-checkmark-outline';
  return 'pricetag-outline';
};

const fmtMoney = (n: number) =>
  `$${(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
};

export default function CommissionsScreen({ navigation, route }: Props) {
  const { token } = route.params;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [summary, setSummary] = useState<Summary>({
    totalCount: 0,
    totalCommission: 0,
    pendingTotal: 0,
    paidTotal: 0,
    advisorCount: 0,
  });

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [serviceFilter, setServiceFilter] = useState<string>('');
  const [serviceModalOpen, setServiceModalOpen] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payNotes, setPayNotes] = useState('');
  const [paying, setPaying] = useState(false);

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token]
  );

  const fetchLedger = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      params.set('page', '1');
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (serviceFilter) params.set('service_type', serviceFilter);
      const res = await fetch(`${API_URL}/api/admin/commissions/ledger?${params.toString()}`, {
        headers: authHeaders,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRows(data.data || []);
      setSummary(
        data.summary || {
          totalCount: 0,
          totalCommission: 0,
          pendingTotal: 0,
          paidTotal: 0,
          advisorCount: 0,
        }
      );
      // Limpiar selecciones que ya no aplican
      setSelectedIds((prev) => {
        const next = new Set<number>();
        (data.data || []).forEach((r: CommissionRow) => {
          if (prev.has(r.id) && r.status === 'pending') next.add(r.id);
        });
        return next;
      });
    } catch (err) {
      console.error('[Commissions] fetchLedger:', err);
      Alert.alert('Error', 'No se pudieron cargar las comisiones.');
    }
  }, [authHeaders, statusFilter, serviceFilter]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchLedger();
      setLoading(false);
    })();
  }, [fetchLedger]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchLedger();
    setRefreshing(false);
  }, [fetchLedger]);

  const toggleSelect = (row: CommissionRow) => {
    if (row.status !== 'pending') return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  };

  const selectAllPending = () => {
    const pendings = rows.filter((r) => r.status === 'pending').map((r) => r.id);
    setSelectedIds(new Set(pendings));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectedTotal = useMemo(
    () => rows.filter((r) => selectedIds.has(r.id)).reduce((s, r) => s + (r.commissionAmount || 0), 0),
    [rows, selectedIds]
  );

  const confirmPay = () => {
    if (selectedIds.size === 0) return;
    setPayNotes('');
    setPayModalOpen(true);
  };

  const doPay = async () => {
    if (selectedIds.size === 0) return;
    setPaying(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/commissions/pay`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          commission_ids: Array.from(selectedIds),
          notes: payNotes.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      Alert.alert(
        'Comisiones pagadas',
        `${data.paidCount || 0} comisiones marcadas como pagadas · Total ${fmtMoney(data.totalPaid || 0)}`
      );
      setPayModalOpen(false);
      setSelectedIds(new Set());
      await fetchLedger();
    } catch (err) {
      console.error('[Commissions] doPay:', err);
      Alert.alert('Error', 'No se pudieron marcar como pagadas.');
    } finally {
      setPaying(false);
    }
  };

  const renderRow = ({ item }: { item: CommissionRow }) => {
    const isSelected = selectedIds.has(item.id);
    const isPending = item.status === 'pending';
    return (
      <TouchableOpacity
        style={[styles.row, isSelected && styles.rowSelected]}
        onPress={() => toggleSelect(item)}
        activeOpacity={isPending ? 0.7 : 1}
      >
        <View style={styles.checkboxCol}>
          {isPending ? (
            <View style={[styles.checkbox, isSelected && styles.checkboxOn]}>
              {isSelected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
            </View>
          ) : (
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
          )}
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.rowTop}>
            <Ionicons name={serviceIcon(item.serviceType)} size={14} color="#64748B" />
            <Text style={styles.serviceText} numberOfLines={1}>
              {SERVICE_LABEL[item.serviceType] || item.serviceType}
            </Text>
            <Text style={styles.dateText}>{fmtDate(item.createdAt)}</Text>
          </View>
          <Text style={styles.advisorName} numberOfLines={1}>
            {item.advisorName}
          </Text>
          <Text style={styles.metaText} numberOfLines={1}>
            {item.tracking} · {item.clientName}
          </Text>
          <View style={styles.rowBottom}>
            <Text style={styles.baseText}>Base {fmtMoney(item.paymentAmount)}</Text>
            <Text style={styles.rateText}>{item.commissionRate}%</Text>
            <Text style={styles.amountText}>{fmtMoney(item.commissionAmount)}</Text>
          </View>
        </View>

        <View style={[styles.statusPill, isPending ? styles.statusPending : styles.statusPaid]}>
          <Text style={[styles.statusText, isPending ? { color: '#B45309' } : { color: '#047857' }]}>
            {isPending ? 'Pendiente' : 'Pagada'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Comisiones</Text>
          <Text style={styles.subtitle}>Aprueba y consulta comisiones de asesores</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={22} color={ORANGE} />
        </TouchableOpacity>
      </View>

      {/* Resumen */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { borderColor: '#FDE68A' }]}>
          <Text style={styles.summaryLabel}>Pendiente</Text>
          <Text style={[styles.summaryValue, { color: '#B45309' }]}>{fmtMoney(summary.pendingTotal)}</Text>
        </View>
        <View style={[styles.summaryCard, { borderColor: '#A7F3D0' }]}>
          <Text style={styles.summaryLabel}>Pagado</Text>
          <Text style={[styles.summaryValue, { color: '#047857' }]}>{fmtMoney(summary.paidTotal)}</Text>
        </View>
        <View style={[styles.summaryCard, { borderColor: '#E5E7EB' }]}>
          <Text style={styles.summaryLabel}>Asesores</Text>
          <Text style={[styles.summaryValue, { color: '#0F172A' }]}>{summary.advisorCount}</Text>
        </View>
      </View>

      {/* Filtros */}
      <View style={styles.filtersWrap}>
        <View style={styles.statusGroup}>
          {STATUS_FILTERS.map((s) => {
            const active = statusFilter === s.key;
            return (
              <TouchableOpacity
                key={s.key}
                style={[styles.statusBtn, active && styles.statusBtnActive]}
                onPress={() => setStatusFilter(s.key)}
              >
                <Text style={[styles.statusBtnText, active && styles.statusBtnTextActive]}>{s.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity style={styles.serviceBtn} onPress={() => setServiceModalOpen(true)}>
          <Ionicons name="funnel-outline" size={14} color="#475569" />
          <Text style={styles.serviceBtnText} numberOfLines={1}>
            {serviceFilter ? SERVICE_LABEL[serviceFilter] : 'Todos los servicios'}
          </Text>
          <Ionicons name="chevron-down" size={14} color="#475569" />
        </TouchableOpacity>
      </View>

      {/* Lista */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ORANGE} size="large" />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => String(r.id)}
          renderItem={renderRow}
          contentContainerStyle={{ padding: 12, paddingBottom: selectedIds.size > 0 ? 120 : 40 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="cash-outline" size={42} color="#CBD5E1" />
              <Text style={styles.emptyText}>Sin comisiones para mostrar</Text>
            </View>
          }
          ListHeaderComponent={
            statusFilter === 'pending' && rows.some((r) => r.status === 'pending') ? (
              <View style={styles.bulkBar}>
                <TouchableOpacity onPress={selectAllPending}>
                  <Text style={styles.bulkLink}>Seleccionar todas</Text>
                </TouchableOpacity>
                {selectedIds.size > 0 && (
                  <TouchableOpacity onPress={clearSelection}>
                    <Text style={[styles.bulkLink, { color: '#B91C1C' }]}>Limpiar selección</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null
          }
        />
      )}

      {/* Barra de acción flotante */}
      {selectedIds.size > 0 && (
        <View style={styles.actionBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionCount}>
              {selectedIds.size} seleccionada{selectedIds.size === 1 ? '' : 's'}
            </Text>
            <Text style={styles.actionTotal}>{fmtMoney(selectedTotal)}</Text>
          </View>
          <TouchableOpacity style={styles.payBtn} onPress={confirmPay}>
            <Ionicons name="checkmark-done" size={18} color="#fff" />
            <Text style={styles.payBtnText}>Marcar pagadas</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal selector de servicio */}
      <Modal visible={serviceModalOpen} animationType="slide" transparent onRequestClose={() => setServiceModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Filtrar por servicio</Text>
            {SERVICE_OPTIONS.map((opt) => {
              const active = serviceFilter === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key || 'all'}
                  style={[styles.sheetOption, active && styles.sheetOptionActive]}
                  onPress={() => {
                    setServiceFilter(opt.key);
                    setServiceModalOpen(false);
                  }}
                >
                  <Ionicons name={opt.key ? serviceIcon(opt.key) : 'apps-outline'} size={18} color={active ? ORANGE : '#475569'} />
                  <Text style={[styles.sheetOptionText, active && { color: ORANGE, fontWeight: '700' }]}>{opt.label}</Text>
                  {active ? <Ionicons name="checkmark" size={18} color={ORANGE} /> : null}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.sheetCloseBtn} onPress={() => setServiceModalOpen(false)}>
              <Text style={styles.sheetCloseText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal confirmar pago */}
      <Modal visible={payModalOpen} animationType="fade" transparent onRequestClose={() => setPayModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Marcar como pagadas</Text>
            <Text style={styles.confirmText}>
              {selectedIds.size} comisión{selectedIds.size === 1 ? '' : 'es'} · Total{' '}
              <Text style={{ fontWeight: '700', color: ORANGE }}>{fmtMoney(selectedTotal)}</Text>
            </Text>
            <Text style={styles.confirmLabel}>Notas (opcional)</Text>
            <TextInput
              style={styles.notesInput}
              value={payNotes}
              onChangeText={setPayNotes}
              placeholder="Ej. Pagado por SPEI 30/may/2026"
              placeholderTextColor="#94A3B8"
              multiline
              maxLength={250}
            />
            <View style={styles.confirmBtnRow}>
              <TouchableOpacity
                style={[styles.cancelBtn]}
                onPress={() => setPayModalOpen(false)}
                disabled={paying}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.payBtn, { flex: 2 }, paying && { opacity: 0.6 }]}
                onPress={doPay}
                disabled={paying}
              >
                {paying ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-done" size={18} color="#fff" />
                    <Text style={styles.payBtnText}>Confirmar</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: { padding: 4, marginRight: 4 },
  refreshBtn: { padding: 6 },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  subtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
  },
  summaryLabel: { fontSize: 10, color: '#64748B', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  summaryValue: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  filtersWrap: {
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
  },
  statusGroup: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 999,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statusBtn: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 999 },
  statusBtnActive: { backgroundColor: ORANGE },
  statusBtnText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  statusBtnTextActive: { color: '#fff' },
  serviceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  serviceBtnText: { flex: 1, fontSize: 13, color: '#0F172A', fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  rowSelected: { borderColor: ORANGE, backgroundColor: '#FFF7ED' },
  checkboxCol: { width: 24, alignItems: 'center', justifyContent: 'center', paddingTop: 2 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: ORANGE, borderColor: ORANGE },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  serviceText: { flex: 1, fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase' },
  dateText: { fontSize: 11, color: '#94A3B8' },
  advisorName: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginTop: 4 },
  metaText: { fontSize: 11, color: '#64748B', marginTop: 2 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  baseText: { fontSize: 11, color: '#64748B' },
  rateText: {
    fontSize: 11,
    color: '#0F172A',
    fontWeight: '700',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  amountText: { fontSize: 14, color: ORANGE, fontWeight: '700', marginLeft: 'auto' },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  statusPending: { backgroundColor: '#FEF3C7' },
  statusPaid: { backgroundColor: '#D1FAE5' },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#94A3B8', marginTop: 8 },
  bulkBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  bulkLink: { fontSize: 12, fontWeight: '700', color: ORANGE },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  actionCount: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  actionTotal: { fontSize: 18, color: ORANGE, fontWeight: '700' },
  payBtn: {
    height: 46,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: ORANGE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  payBtnText: { color: '#fff', fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 10 },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  sheetOptionActive: { backgroundColor: '#FFF7ED' },
  sheetOptionText: { flex: 1, fontSize: 14, color: '#0F172A' },
  sheetCloseBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 8 },
  sheetCloseText: { color: '#475569', fontWeight: '700' },
  confirmCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
  },
  confirmTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  confirmText: { fontSize: 13, color: '#475569', marginTop: 6 },
  confirmLabel: { fontSize: 12, fontWeight: '700', color: '#64748B', marginTop: 14, marginBottom: 6, textTransform: 'uppercase' },
  notesInput: {
    minHeight: 70,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    color: '#0F172A',
    textAlignVertical: 'top',
  },
  confirmBtnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  cancelBtnText: { color: '#475569', fontWeight: '700' },
});
