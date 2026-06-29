/**
 * CobranzaDashboardScreen
 * -----------------------------------------------------------
 * Vista de KPIs financieros (solo lectura) para director /
 * admin / super_admin. Consume /api/admin/finance/dashboard.
 * Toda gestión se realiza desde el Panel Web.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
  StatusBar, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { API_URL } from '../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'CobranzaDashboard'>;

const ORANGE = '#F05A28';
const BG = '#F4F6F8';
const GREEN = '#2E7D32';
const RED = '#C62828';
const BLUE = '#1976D2';
const PURPLE = '#7B1FA2';
const TEAL = '#00897B';

interface FinanceData {
  kpis: {
    ingresos_hoy: number; ingresos_hoy_neto: number;
    ingresos_mes: number; ingresos_mes_neto: number;
    spei_hoy: number; spei_hoy_neto: number;
    spei_mes: number; spei_mes_neto: number;
    paypal_hoy: number; paypal_mes: number;
    efectivo_hoy: number; efectivo_mes: number;
    cartera_vencida: number;
    guias_pendientes: number;
    saldo_caja: number;
    comisiones_mes: number;
  };
  distribucion_metodos: { efectivo: number; spei: number; paypal: number };
  porcentajes: { efectivo: string; spei: string; paypal: string };
  ingresos_por_empresa: Array<{
    empresa_id: number; empresa_nombre: string; rfc: string;
    total_bruto: number; total_neto: number; comisiones: number; transacciones: number;
  }>;
  ingresos_por_servicio: Array<{ servicio: string; cantidad: number; monto: number }>;
  transacciones: Array<{
    id: number; fecha_hora: string; cliente: string; monto_bruto: number; monto_neto: number;
    metodo: string; concepto: string; origen: string; estatus: string; service_type: string | null;
  }>;
}

const SERVICE_LABEL: Record<string, string> = {
  POBOX_USA: 'PO Box USA', usa_pobox: 'PO Box USA', pobox: 'PO Box USA',
  AIR_CHN_MX: 'Aéreo China', china_air: 'Aéreo China', aereo: 'Aéreo China',
  SEA_CHN_MX: 'Marítimo China', china_sea: 'Marítimo China', maritime: 'Marítimo',
  AA_DHL: 'Nacional DHL', mx_cedis: 'Nacional DHL', dhl: 'DHL',
};
const METHOD_LABEL: Record<string, string> = { efectivo: 'Efectivo', cash: 'Efectivo', spei: 'SPEI', paypal: 'PayPal' };
const METHOD_COLOR: Record<string, string> = { efectivo: GREEN, cash: GREEN, spei: BLUE, paypal: '#0070BA' };

const money = (n: number) => `$${(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDateTime = (iso: string) => { try { return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

const COBRAR_SERVICES = [
  { key: 'POBOX_USA', label: 'PO Box USA', icon: 'cube-outline' as const, color: GREEN },
  { key: 'AIR_CHN_MX', label: 'Aéreo China', icon: 'airplane-outline' as const, color: BLUE },
  { key: 'SEA_CHN_MX', label: 'Marítimo China', icon: 'boat-outline' as const, color: TEAL },
  { key: 'AA_DHL', label: 'Nacional DHL', icon: 'car-outline' as const, color: '#B26A00' },
];

export default function CobranzaDashboardScreen({ navigation, route }: Props) {
  const { user, token } = route.params;
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/finance/dashboard`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setData(d);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo cargar el dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <StatusBar barStyle="light-content" backgroundColor={ORANGE} />
        <Header onBack={() => navigation.goBack()} />
        <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
      </SafeAreaView>
    );
  }

  const { kpis, distribucion_metodos, porcentajes, ingresos_por_empresa, ingresos_por_servicio, transacciones } = data;
  const totalMes = distribucion_metodos.efectivo + distribucion_metodos.spei + distribucion_metodos.paypal;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={ORANGE} />
      <Header onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
      >
        {/* COBRAR PAGOS — selecciona servicio para ver pendientes y confirmar */}
        <SectionTitle icon="card" text="Cobrar pagos" />
        <View style={styles.cobrarGrid}>
          {COBRAR_SERVICES.map(s => (
            <TouchableOpacity
              key={s.key}
              style={styles.cobrarBtn}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('CobranzaPending', { user, token, serviceType: s.key, serviceLabel: s.label })}
            >
              <View style={[styles.cobrarIcon, { backgroundColor: s.color + '18' }]}>
                <Ionicons name={s.icon} size={22} color={s.color} />
              </View>
              <Text style={styles.cobrarLabel}>{s.label}</Text>
              <Ionicons name="chevron-forward" size={16} color="#bbb" />
            </TouchableOpacity>
          ))}
        </View>

        {/* HOY */}
        <SectionTitle icon="today" text="Hoy" />
        <View style={styles.bigKpiRow}>
          <BigKpi label="Ingresos brutos" value={money(kpis.ingresos_hoy)} sub={`Neto ${money(kpis.ingresos_hoy_neto)}`} color={GREEN} icon="cash-outline" />
          <BigKpi label="Saldo en caja" value={money(kpis.saldo_caja)} color={kpis.saldo_caja >= 0 ? BLUE : RED} icon="wallet-outline" />
        </View>
        <View style={styles.kpiRow}>
          <Kpi label="Efectivo hoy" value={money(kpis.efectivo_hoy)} color={GREEN} icon="cash" />
          <Kpi label="SPEI hoy" value={money(kpis.spei_hoy)} color={BLUE} icon="swap-horizontal" />
          <Kpi label="PayPal hoy" value={money(kpis.paypal_hoy)} color="#0070BA" icon="logo-paypal" />
        </View>

        {/* MES */}
        <SectionTitle icon="calendar" text="Mes actual" />
        <View style={styles.bigKpiRow}>
          <BigKpi label="Ingresos del mes" value={money(kpis.ingresos_mes)} sub={`Neto ${money(kpis.ingresos_mes_neto)}`} color={PURPLE} icon="trending-up" />
          <BigKpi label="Comisiones mes" value={money(kpis.comisiones_mes)} color="#EF6C00" icon="receipt-outline" />
        </View>
        <View style={styles.kpiRow}>
          <Kpi label="Efectivo" value={money(kpis.efectivo_mes)} color={GREEN} icon="cash" />
          <Kpi label="SPEI" value={money(kpis.spei_mes)} color={BLUE} icon="swap-horizontal" />
          <Kpi label="PayPal" value={money(kpis.paypal_mes)} color="#0070BA" icon="logo-paypal" />
        </View>

        {/* Cartera */}
        <SectionTitle icon="alert-circle" text="Cartera" />
        <View style={styles.kpiRow}>
          <Kpi label="Cartera vencida" value={money(kpis.cartera_vencida)} color={RED} icon="warning-outline" />
          <Kpi label="Guías pendientes" value={String(kpis.guias_pendientes)} color="#EF6C00" icon="cube-outline" />
        </View>

        {/* Distribución de métodos */}
        <SectionTitle icon="pie-chart" text="Distribución de métodos (mes)" />
        <View style={styles.distCard}>
          {(['efectivo', 'spei', 'paypal'] as const).map(m => {
            const val = distribucion_metodos[m];
            const pct = parseFloat(porcentajes[m] || '0');
            return (
              <View key={m} style={{ marginBottom: 10 }}>
                <View style={styles.distHeader}>
                  <View style={[styles.distDot, { backgroundColor: METHOD_COLOR[m] }]} />
                  <Text style={styles.distName}>{METHOD_LABEL[m]}</Text>
                  <Text style={styles.distPct}>{pct.toFixed(1)}%</Text>
                  <Text style={styles.distVal}>{money(val)}</Text>
                </View>
                <View style={styles.barBg}>
                  <View style={[styles.barFill, { backgroundColor: METHOD_COLOR[m], width: `${Math.min(pct, 100)}%` }]} />
                </View>
              </View>
            );
          })}
          <Text style={styles.distTotal}>Total mes: {money(totalMes)}</Text>
        </View>

        {/* Ingresos por empresa */}
        {ingresos_por_empresa.length > 0 && (
          <>
            <SectionTitle icon="business" text="Ingresos por empresa (mes)" />
            {ingresos_por_empresa.map(e => (
              <View key={e.empresa_id} style={styles.empresaRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.empresaName}>{e.empresa_nombre}</Text>
                  <Text style={styles.empresaMeta}>{e.rfc} · {e.transacciones} txs · Com. {money(e.comisiones)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.empresaBruto}>{money(e.total_bruto)}</Text>
                  <Text style={styles.empresaNeto}>neto {money(e.total_neto)}</Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Ingresos por servicio */}
        {ingresos_por_servicio.length > 0 && (
          <>
            <SectionTitle icon="layers" text="Ingresos por servicio" />
            {ingresos_por_servicio.map(s => (
              <View key={s.servicio} style={styles.empresaRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.empresaName}>{SERVICE_LABEL[s.servicio] || s.servicio}</Text>
                  <Text style={styles.empresaMeta}>{s.cantidad} pagos</Text>
                </View>
                <Text style={styles.empresaBruto}>{money(s.monto)}</Text>
              </View>
            ))}
          </>
        )}

        {/* Transacciones recientes */}
        <SectionTitle icon="time" text={`Últimas transacciones (${Math.min(transacciones.length, 20)})`} />
        {transacciones.slice(0, 20).map(t => (
          <View key={`${t.origen}-${t.id}`} style={styles.txRow}>
            <View style={[styles.txIcon, { backgroundColor: (METHOD_COLOR[t.metodo] || TEAL) + '22' }]}>
              <Ionicons name="arrow-up" size={14} color={METHOD_COLOR[t.metodo] || TEAL} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.txCliente} numberOfLines={1}>{t.cliente}</Text>
              <Text style={styles.txMeta} numberOfLines={1}>
                {(METHOD_LABEL[t.metodo] || t.metodo)} · {t.origen}{t.service_type ? ` · ${SERVICE_LABEL[t.service_type] || t.service_type}` : ''} · {formatDateTime(t.fecha_hora)}
              </Text>
            </View>
            <Text style={[styles.txMonto, { color: GREEN }]}>+{money(t.monto_bruto)}</Text>
          </View>
        ))}
        {transacciones.length === 0 && (
          <View style={styles.emptyBox}><Text style={styles.muted}>Sin transacciones en el periodo</Text></View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.headerBtn} hitSlop={10}>
        <Ionicons name="chevron-back" size={26} color="#fff" />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle}>Dashboard de Cobranza</Text>
        <Text style={styles.headerSubtitle}>KPIs financieros · Solo lectura</Text>
      </View>
    </View>
  );
}

function SectionTitle({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Ionicons name={icon} size={14} color="#444" />
      <Text style={styles.sectionTitleTxt}>{text}</Text>
    </View>
  );
}

function BigKpi({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color: string; icon: any }) {
  return (
    <View style={[styles.bigKpiBox, { borderLeftColor: color }]}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={styles.bigKpiLbl}>{label}</Text>
      <Text style={styles.bigKpiVal}>{value}</Text>
      {!!sub && <Text style={styles.bigKpiSub}>{sub}</Text>}
    </View>
  );
}

function Kpi({ label, value, color, icon }: { label: string; value: string; color: string; icon: any }) {
  return (
    <View style={[styles.kpiBox, { borderLeftColor: color }]}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={styles.kpiVal}>{value}</Text>
      <Text style={styles.kpiLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: '#888' },
  header: { backgroundColor: ORANGE, paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  headerBtn: { padding: 6 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  headerSubtitle: { color: '#FFE0D2', fontSize: 12, marginTop: 2 },

  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: '#FFF4E0', borderColor: '#FFD699', borderWidth: 1, borderRadius: 8, marginBottom: 14 },
  bannerTxt: { color: '#B26A00', fontSize: 12, flex: 1 },

  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, marginBottom: 8 },
  sectionTitleTxt: { fontSize: 12, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 0.4 },
  cobrarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cobrarBtn: {
    width: '48.5%', backgroundColor: '#fff', borderRadius: 12, padding: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  cobrarIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cobrarLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: '#222' },

  bigKpiRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  bigKpiBox: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, borderLeftWidth: 4, gap: 4 },
  bigKpiLbl: { fontSize: 11, color: '#666', marginTop: 2 },
  bigKpiVal: { fontSize: 17, fontWeight: '700', color: '#222' },
  bigKpiSub: { fontSize: 10, color: '#888' },

  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  kpiBox: { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 10, borderLeftWidth: 3 },
  kpiVal: { fontSize: 13, fontWeight: '700', color: '#222', marginTop: 2 },
  kpiLbl: { fontSize: 10, color: '#666' },

  distCard: { backgroundColor: '#fff', padding: 12, borderRadius: 10 },
  distHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  distDot: { width: 10, height: 10, borderRadius: 5 },
  distName: { fontSize: 12, color: '#222', fontWeight: '600', flex: 1 },
  distPct: { fontSize: 11, color: '#666', fontWeight: '600' },
  distVal: { fontSize: 12, color: '#222', fontWeight: '700', marginLeft: 8 },
  barBg: { height: 6, backgroundColor: '#EEE', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  distTotal: { fontSize: 11, color: '#666', textAlign: 'right', marginTop: 6, fontStyle: 'italic' },

  empresaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 6 },
  empresaName: { fontSize: 13, fontWeight: '700', color: '#222' },
  empresaMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  empresaBruto: { fontSize: 13, fontWeight: '700', color: GREEN },
  empresaNeto: { fontSize: 10, color: '#888', marginTop: 2 },

  txRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', padding: 10, borderRadius: 10, marginBottom: 6 },
  txIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  txCliente: { fontSize: 13, fontWeight: '600', color: '#222' },
  txMeta: { fontSize: 10, color: '#888', marginTop: 2 },
  txMonto: { fontSize: 13, fontWeight: '700' },

  emptyBox: { alignItems: 'center', padding: 20, backgroundColor: '#fff', borderRadius: 10 },
});
