// ============================================
// RESUMEN DE COMISIONES POR TIPO DE SERVICIO
// Se abre al tocar el monto de "Comisiones del Mes" en el dashboard del asesor.
// Para líderes muestra además el override generado por cada subasesor.
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
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

interface LeaderOverride {
  total: number;
  pending: number;
  paid: number;
  subCount: number;
}

interface SubAdvisor {
  subId: number;
  subName: string;
  count: number;
  overrideTotal: number;
  overridePending: number;
  overridePaid: number;
}

const fmt = (n: number) =>
  `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Filtros
const DATE_PRESETS = [
  { key: 'all',       label: 'Todo' },
  { key: 'month',     label: 'Este mes' },
  { key: 'lastmonth', label: 'Mes pasado' },
  { key: 'week',      label: 'Semana (vie–jue)' },
];
const SERVICE_FILTERS = [
  { key: 'all', label: '🗂️ Todos' },
  { key: 'pobox_usa_mx', label: '📦 PO Box' },
  { key: 'aereo_china_mx', label: '✈️ Aéreo' },
  { key: 'maritimo_china_mx', label: '🚢 Marítimo' },
  { key: 'liberacion_aa_dhl', label: '📮 DHL' },
  { key: 'gex_warranty', label: '🛡️ GEX' },
  { key: 'xpay', label: '💱 X-Pay' },
  { key: 'nacional_mx', label: '🚚 Nacional' },
];
const STATUS_FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'pending', label: '⏳ Por cobrar' },
  { key: 'paid', label: '✅ Pagadas' },
];

// Calcula el rango de fechas (YYYY-MM-DD) según el preset seleccionado.
// Usa componentes LOCALES (no UTC) para no correrse un día por zona horaria.
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const dateRange = (preset: string): { from?: string; to?: string } => {
  const now = new Date();
  if (preset === 'month') {
    return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)) };
  }
  if (preset === 'lastmonth') {
    return {
      from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: iso(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  if (preset === 'week') {
    // Semana de comisiones viernes→jueves, la recién cerrada:
    // fin = último jueves (getDay 4) en o antes de hoy; inicio = su viernes anterior.
    const end = new Date(now);
    const diff = (end.getDay() - 4 + 7) % 7; // días desde el último jueves (0 si hoy es jueves)
    end.setDate(end.getDate() - diff);
    const start = new Date(end);
    start.setDate(start.getDate() - 6); // viernes anterior a ese jueves
    return { from: iso(start), to: iso(end) };
  }
  return {};
};

export default function CommissionsSummaryScreen({ navigation, route }: any) {
  const { user, token } = route.params;
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [byService, setByService] = useState<ServiceRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [leaderOverride, setLeaderOverride] = useState<LeaderOverride | null>(null);
  const [subAdvisors, setSubAdvisors] = useState<SubAdvisor[]>([]);

  // Filtros
  const [datePreset, setDatePreset] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // ─── Cortes recibidos ───
  // El total acumulado del histórico no le dice al asesor lo que le importa:
  // cuánto le pagaron en el último corte. Eso es lo que va en la tarjeta grande.
  const [cortes, setCortes] = useState<any[]>([]);
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const [corteAbierto, setCorteAbierto] = useState<number | null>(null);
  const cargarCortes = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/advisor/commission-cuts`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setCortes(Array.isArray(d.cortes) ? d.cortes : []);
    } catch { setCortes([]); }
  }, [token]);
  const bajarPdf = async (cutId: number) => {
    try {
      const destino = `${FileSystem.cacheDirectory}corte-${cutId}.pdf`;
      const r = await FileSystem.downloadAsync(
        `${API_URL}/api/advisor/commission-cuts/${cutId}/pdf`, destino,
        { headers: { Authorization: `Bearer ${token}` } });
      if (r.status !== 200) throw new Error();
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(r.uri, { mimeType: 'application/pdf' });
      else Alert.alert('Listo', 'El comprobante se descargó.');
    } catch { Alert.alert('Error', 'No se pudo descargar el comprobante'); }
  };
  const fechaCorta = (iso: string) => {
    try { return new Date(String(iso).length === 10 ? `${iso}T12:00:00` : iso)
      .toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }); } catch { return String(iso); }
  };

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      const { from, to } = dateRange(datePreset);
      if (from) params.append('from_date', from);
      if (to) params.append('to_date', to);
      if (serviceFilter !== 'all') params.append('service_type', serviceFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      const res = await fetch(`${API_URL}/api/advisor/commissions?${params.toString()}`, {
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
      setLeaderOverride(data.leaderOverride || null);
      setSubAdvisors(Array.isArray(data.subAdvisors) ? data.subAdvisors : []);
    } catch (e) {
      console.error('Error cargando resumen de comisiones:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, datePreset, serviceFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { cargarCortes(); }, [cargarCortes]);

  const onRefresh = () => { setRefreshing(true); load(); cargarCortes(); };

  // Total combinado: comisión propia + override de subasesores.
  const own = totals?.totalCommission || 0;
  const ovr = leaderOverride?.total || 0;
  const combinedTotal = own + ovr;
  const combinedPending = (totals?.pendingCommission || 0) + (leaderOverride?.pending || 0);

  // % por servicio se calcula sobre la comisión propia (el override no es por servicio).
  const ownServiceSum = byService.reduce((s, r) => s + r.totalCommission, 0) || 1;

  const renderChips = (
    options: { key: string; label: string }[],
    value: string,
    onChange: (k: string) => void,
  ) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {options.map(o => (
        <TouchableOpacity
          key={o.key}
          onPress={() => onChange(o.key)}
          style={[styles.chip, value === o.key && styles.chipActive]}
        >
          <Text style={[styles.chipText, value === o.key && styles.chipTextActive]}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

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
          {/* Filtros */}
          <Text style={styles.filterLabel}>FECHA</Text>
          {renderChips(DATE_PRESETS, datePreset, setDatePreset)}
          <Text style={styles.filterLabel}>SERVICIO</Text>
          {renderChips(SERVICE_FILTERS, serviceFilter, setServiceFilter)}
          <Text style={styles.filterLabel}>ESTADO</Text>
          {renderChips(STATUS_FILTERS, statusFilter, setStatusFilter)}

          {/* Último corte. El acumulado del histórico no le dice al asesor lo
              que necesita —cuánto le pagaron la semana pasada—, así que la
              tarjeta grande muestra el corte más reciente y lleva al historial. */}
          {(() => {
            const ultimo = cortes[0];
            return (
              <TouchableOpacity activeOpacity={0.9} onPress={() => setHistorialAbierto(true)}>
                <LinearGradient colors={[ORANGE, RED]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.totalCard}>
                  {ultimo ? (
                    <>
                      <Text style={styles.totalLabel}>
                        Último corte · {fechaCorta(ultimo.desde)} — {fechaCorta(ultimo.hasta)}
                      </Text>
                      <Text style={styles.totalAmount}>{fmt(ultimo.total)}</Text>
                      <Text style={styles.totalSub}>
                        MXN · {ultimo.guias} guías · pagado el {fechaCorta(ultimo.fecha)}
                      </Text>
                      {Number(ultimo.override) > 0 && (
                        <View style={styles.breakdownRow}>
                          <View style={styles.breakdownItem}>
                            <Text style={styles.breakdownLabel}>Propia</Text>
                            <Text style={styles.breakdownValue}>{fmt(ultimo.propia)}</Text>
                          </View>
                          <View style={styles.breakdownItem}>
                            <Text style={styles.breakdownLabel}>De subasesores</Text>
                            <Text style={styles.breakdownValue}>{fmt(ultimo.override)}</Text>
                          </View>
                        </View>
                      )}
                    </>
                  ) : (
                    <>
                      <Text style={styles.totalLabel}>Aún no has recibido un corte</Text>
                      <Text style={styles.totalAmount}>{fmt(0)}</Text>
                      <Text style={styles.totalSub}>
                        Los cortes se hacen de viernes a jueves. Cuando se genere el tuyo, aparecerá aquí.
                      </Text>
                    </>
                  )}

                  {/* Lo que sigue vivo hoy, para no perderlo de vista. */}
                  <View style={styles.totalSplit}>
                    <View style={styles.totalSplitItem}>
                      <Text style={styles.totalSplitLabel}>Por cobrar hoy</Text>
                      <Text style={styles.totalSplitValue}>{fmt(combinedPending)}</Text>
                    </View>
                    <View style={styles.totalSplitDivider} />
                    <View style={styles.totalSplitItem}>
                      <Text style={styles.totalSplitLabel}>Acumulado histórico</Text>
                      <Text style={styles.totalSplitValue}>{fmt(combinedTotal)}</Text>
                    </View>
                  </View>

                  <View style={styles.verHistorial}>
                    <Ionicons name="receipt-outline" size={15} color="#fff" />
                    <Text style={styles.verHistorialTxt}>
                      Ver historial de cortes{cortes.length > 0 ? ` (${cortes.length})` : ''}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color="#fff" />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            );
          })()}

          {/* Subasesores (solo líderes) */}
          {subAdvisors.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>COMISIÓN DE TUS SUBASESORES</Text>
              {subAdvisors.map((s) => (
                <View key={s.subId} style={styles.subCard}>
                  <View style={styles.serviceRow}>
                    <View style={[styles.serviceIcon, { backgroundColor: '#5e35b118' }]}>
                      <Ionicons name="people" size={20} color="#5e35b1" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.serviceName}>{s.subName}</Text>
                      <Text style={styles.serviceCount}>{s.count} guías</Text>
                    </View>
                    <Text style={[styles.serviceAmount, { color: '#5e35b1' }]}>{fmt(s.overrideTotal)}</Text>
                  </View>
                  <View style={styles.serviceFooter}>
                    <View style={styles.footerItem}>
                      <View style={[styles.dot, { backgroundColor: '#F5A623' }]} />
                      <Text style={styles.footerText}>Por cobrar {fmt(s.overridePending)}</Text>
                    </View>
                    <View style={styles.footerItem}>
                      <View style={[styles.dot, { backgroundColor: '#2E9E5B' }]} />
                      <Text style={styles.footerText}>Pagado {fmt(s.overridePaid)}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </>
          )}

          <Text style={styles.sectionTitle}>POR TIPO DE SERVICIO</Text>

          {byService.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="cube-outline" size={42} color="#ccc" />
              <Text style={styles.emptyText}>No hay comisiones con estos filtros</Text>
            </View>
          ) : (
            byService.map((s) => {
              const meta = SERVICE_META[s.serviceType] || { label: s.serviceType, icon: '📦' };
              const pct = (s.totalCommission / ownServiceSum) * 100;
              return (
                <TouchableOpacity
                  key={s.serviceType}
                  style={styles.serviceCard}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('AdvisorCommissions', { user, token, serviceFilter: s.serviceType })}
                >
                  <View style={styles.serviceRow}>
                    <View style={styles.serviceIcon}>
                      <Text style={{ fontSize: 20 }}>{meta.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.serviceName}>{meta.label}</Text>
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
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Historial de cortes recibidos */}
      <Modal visible={historialAbierto} animationType="slide" transparent onRequestClose={() => setHistorialAbierto(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%' }}>
            <View style={styles.histHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.histTitle}>🧾 Historial de cortes</Text>
                <Text style={styles.histSub}>Cada corte es un pago de comisiones de viernes a jueves</Text>
              </View>
              <TouchableOpacity onPress={() => setHistorialAbierto(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            {cortes.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Ionicons name="receipt-outline" size={44} color="#ccc" />
                <Text style={{ color: '#888', marginTop: 10, textAlign: 'center' }}>
                  Todavía no has recibido ningún corte.
                </Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 28 }}>
                {cortes.map((c: any) => {
                  const abierto = corteAbierto === c.cutId;
                  return (
                    <View key={c.id} style={styles.corteCard}>
                      <TouchableOpacity activeOpacity={0.8} onPress={() => setCorteAbierto(abierto ? null : c.cutId)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.corteFecha}>{fechaCorta(c.desde)} — {fechaCorta(c.hasta)}</Text>
                          <Text style={styles.corteMeta}>{c.guias} guías · corte #{c.cutId}</Text>
                        </View>
                        <Text style={styles.corteMonto}>{fmt(c.total)}</Text>
                        <Ionicons name={abierto ? 'chevron-up' : 'chevron-down'} size={18} color="#9AA0A6" />
                      </TouchableOpacity>
                      {abierto && (
                        <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: '#EEE', paddingTop: 10 }}>
                          <View style={styles.corteFila}>
                            <Text style={styles.corteFilaLbl}>Comisión propia</Text>
                            <Text style={styles.corteFilaVal}>{fmt(c.propia)}</Text>
                          </View>
                          {Number(c.override) > 0 && (
                            <View style={styles.corteFila}>
                              <Text style={styles.corteFilaLbl}>Override de subasesores</Text>
                              <Text style={styles.corteFilaVal}>{fmt(c.override)}</Text>
                            </View>
                          )}
                          {(c.subs || []).length > 0 && (
                            <View style={{ marginTop: 8, backgroundColor: '#F3E5F5', borderRadius: 8, padding: 8 }}>
                              <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#5E35B1', marginBottom: 4 }}>
                                Lo que te toca dispersar
                              </Text>
                              {(c.subs || []).map((sb: any) => (
                                <Text key={sb.subId} style={{ fontSize: 12, color: '#4A148C' }}>
                                  · {sb.name} — {sb.guias} guías — {fmt(sb.monto)}
                                </Text>
                              ))}
                            </View>
                          )}
                          <TouchableOpacity onPress={() => bajarPdf(c.cutId)} style={styles.pdfBtn}>
                            <Ionicons name="document-text-outline" size={16} color="#fff" />
                            <Text style={styles.pdfBtnTxt}>Descargar comprobante PDF</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  verHistorial: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.3)',
  },
  verHistorialTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  histHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#37474F', padding: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20,
  },
  histTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  histSub: { color: 'rgba(255,255,255,0.8)', fontSize: 11.5, marginTop: 2 },
  corteCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 13, marginBottom: 10,
    borderWidth: 1, borderColor: '#E8EAED',
  },
  corteFecha: { fontSize: 14.5, fontWeight: '800', color: '#202124', textTransform: 'capitalize' },
  corteMeta: { fontSize: 11.5, color: '#9AA0A6', marginTop: 1 },
  corteMonto: { fontSize: 17, fontWeight: '800', color: '#2E7D46' },
  corteFila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  corteFilaLbl: { fontSize: 12.5, color: '#5F6368' },
  corteFilaVal: { fontSize: 12.5, fontWeight: '700', color: '#202124' },
  pdfBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    marginTop: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: '#C62828',
  },
  pdfBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
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

  filterLabel: { fontSize: 11, fontWeight: '800', color: '#999', letterSpacing: 0.5, marginBottom: 6, marginTop: 4 },
  chipRow: { gap: 8, paddingBottom: 12 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0',
  },
  chipActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  chipText: { fontSize: 13, color: '#555', fontWeight: '600' },
  chipTextActive: { color: '#fff' },

  totalCard: { borderRadius: 18, padding: 20, marginBottom: 20, marginTop: 4 },
  totalLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  totalAmount: { color: '#fff', fontSize: 34, fontWeight: '800', marginTop: 2 },
  totalSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  breakdownRow: {
    flexDirection: 'row', marginTop: 14, gap: 10,
  },
  breakdownItem: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12,
  },
  breakdownLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600' },
  breakdownValue: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 2 },
  totalSplit: {
    flexDirection: 'row',
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingVertical: 10,
  },
  totalSplitItem: { flex: 1, alignItems: 'center' },
  totalSplitDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.3)' },
  totalSplitLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600' },
  totalSplitValue: { color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 2 },

  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#888', letterSpacing: 0.6, marginBottom: 10, marginTop: 4 },

  serviceCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, elevation: 1 },
  subCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, elevation: 1,
    borderLeftWidth: 4, borderLeftColor: '#5e35b1',
  },
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
