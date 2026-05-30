/**
 * CajaCCScreen — Caja Centro de Costos
 * -----------------------------------------------------------
 * Operación de la caja chica corporativa (no de sucursal).
 * Permite: ver saldo MXN/USD + totales del día, listar últimas
 * transacciones y registrar ingresos / egresos simples.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
  StatusBar, RefreshControl, Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { API_URL } from '../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'CajaCC'>;

const ORANGE = '#F05A28';
const BG = '#F4F6F8';
const GREEN = '#2E7D32';
const RED = '#C62828';

interface Stats {
  saldo_mxn: number; ingresos_hoy_mxn: number; egresos_hoy_mxn: number; transacciones_hoy_mxn: number; ultimo_corte_mxn: string | null;
  saldo_usd: number; ingresos_hoy_usd: number; egresos_hoy_usd: number; transacciones_hoy_usd: number; ultimo_corte_usd: string | null;
}

interface Transaccion {
  id: number;
  tipo: 'ingreso' | 'egreso';
  monto: number;
  concepto: string;
  categoria: string;
  currency: string;
  cliente_nombre: string | null;
  cliente_box_id: string | null;
  created_at: string;
  admin_name: string | null;
}

const CATEGORIAS_INGRESO = ['venta_paquete', 'recarga_saldo', 'otro_ingreso'];
const CATEGORIAS_EGRESO = ['pago_proveedor', 'gasto_operativo', 'reembolso', 'otro_egreso'];
const CAT_LABEL: Record<string, string> = {
  venta_paquete: 'Venta de paquete', recarga_saldo: 'Recarga de saldo', otro_ingreso: 'Otro ingreso',
  pago_proveedor: 'Pago a proveedor', gasto_operativo: 'Gasto operativo', reembolso: 'Reembolso', otro_egreso: 'Otro egreso',
};

const money = (n: number, c = 'MXN') => `$${(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;
const formatDateTime = (iso: string) => { try { const d = new Date(iso); return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

export default function CajaCCScreen({ navigation, route }: Props) {
  const { token } = route.params;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [txs, setTxs] = useState<Transaccion[]>([]);
  const [currency, setCurrency] = useState<'MXN' | 'USD'>('MXN');

  // Modal nuevo movimiento
  const [modalOpen, setModalOpen] = useState(false);
  const [tipo, setTipo] = useState<'ingreso' | 'egreso'>('ingreso');
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [categoria, setCategoria] = useState<string>('venta_paquete');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sRes, tRes] = await Promise.all([
        fetch(`${API_URL}/api/caja-chica/stats`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/caja-chica/transacciones`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const s = await sRes.json();
      const t = await tRes.json();
      setStats(s);
      setTxs(Array.isArray(t) ? t : (t.transacciones || []));
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo cargar Caja CC');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const filteredTxs = useMemo(() => txs.filter(t => (t.currency || 'MXN') === currency).slice(0, 30), [txs, currency]);

  const openNew = (t: 'ingreso' | 'egreso') => {
    setTipo(t);
    setMonto('');
    setConcepto('');
    setNotas('');
    setCategoria(t === 'ingreso' ? CATEGORIAS_INGRESO[0] : CATEGORIAS_EGRESO[0]);
    setModalOpen(true);
  };

  const save = async () => {
    const m = parseFloat(monto.replace(',', '.'));
    if (!m || m <= 0) { Alert.alert('Monto inválido', 'Ingresa un monto mayor a 0'); return; }
    if (!concepto.trim()) { Alert.alert('Concepto requerido', 'Describe brevemente el movimiento'); return; }
    setSaving(true);
    try {
      const endpoint = tipo === 'ingreso' ? '/api/caja-chica/ingreso' : '/api/caja-chica/egreso';
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ monto: m, concepto: concepto.trim(), categoria, notas: notas.trim() || undefined, currency }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      setModalOpen(false);
      load();
      Alert.alert('✅ Guardado', `${tipo === 'ingreso' ? 'Ingreso' : 'Egreso'} de ${money(m, currency)} registrado`);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo registrar');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !stats) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <StatusBar barStyle="light-content" backgroundColor={ORANGE} />
        <Header onBack={() => navigation.goBack()} title="Caja CC" subtitle="Centro de costos" />
        <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
      </SafeAreaView>
    );
  }

  const cur = currency;
  const saldo = cur === 'MXN' ? stats.saldo_mxn : stats.saldo_usd;
  const ingresos = cur === 'MXN' ? stats.ingresos_hoy_mxn : stats.ingresos_hoy_usd;
  const egresos = cur === 'MXN' ? stats.egresos_hoy_mxn : stats.egresos_hoy_usd;
  const movs = cur === 'MXN' ? stats.transacciones_hoy_mxn : stats.transacciones_hoy_usd;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={ORANGE} />
      <Header onBack={() => navigation.goBack()} title="Caja CC" subtitle="Centro de costos · Operativa" />

      {/* Currency toggle */}
      <View style={styles.curRow}>
        {(['MXN', 'USD'] as const).map(c => (
          <TouchableOpacity key={c} onPress={() => setCurrency(c)} style={[styles.curChip, currency === c && styles.curChipActive]}>
            <Text style={[styles.curChipTxt, currency === c && { color: '#fff' }]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
      >
        {/* Saldo */}
        <View style={styles.saldoCard}>
          <Text style={styles.saldoLbl}>Saldo actual</Text>
          <Text style={[styles.saldoVal, saldo < 0 && { color: RED }]}>{money(saldo, cur)}</Text>
        </View>

        {/* KPIs del día */}
        <View style={styles.kpiRow}>
          <Kpi label="Ingresos hoy" value={money(ingresos, cur)} color={GREEN} icon="arrow-up-circle" />
          <Kpi label="Egresos hoy" value={money(egresos, cur)} color={RED} icon="arrow-down-circle" />
          <Kpi label="Movs hoy" value={String(movs)} color="#1976D2" icon="swap-vertical" />
        </View>

        {/* Acciones */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: GREEN }]} onPress={() => openNew('ingreso')}>
            <Ionicons name="add-circle-outline" size={20} color="#fff" />
            <Text style={styles.actionBtnTxt}>Registrar Ingreso</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: RED }]} onPress={() => openNew('egreso')}>
            <Ionicons name="remove-circle-outline" size={20} color="#fff" />
            <Text style={styles.actionBtnTxt}>Registrar Egreso</Text>
          </TouchableOpacity>
        </View>

        {/* Transacciones */}
        <Text style={styles.sectionLabel}>Últimas transacciones ({cur})</Text>
        {filteredTxs.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="receipt-outline" size={36} color="#999" />
            <Text style={styles.muted}>Sin movimientos en {cur}</Text>
          </View>
        ) : (
          filteredTxs.map(t => (
            <View key={t.id} style={styles.txRow}>
              <View style={[styles.txIcon, { backgroundColor: t.tipo === 'ingreso' ? '#E8F5E9' : '#FFEBEE' }]}>
                <Ionicons name={t.tipo === 'ingreso' ? 'arrow-up' : 'arrow-down'} size={16} color={t.tipo === 'ingreso' ? GREEN : RED} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.txConcepto} numberOfLines={1}>{t.concepto}</Text>
                <Text style={styles.txMeta}>
                  {CAT_LABEL[t.categoria] || t.categoria} · {formatDateTime(t.created_at)}
                  {t.cliente_box_id ? ` · ${t.cliente_box_id}` : ''}
                </Text>
              </View>
              <Text style={[styles.txMonto, { color: t.tipo === 'ingreso' ? GREEN : RED }]}>
                {t.tipo === 'ingreso' ? '+' : '−'} {money(Number(t.monto || 0), t.currency || cur)}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* Modal nuevo movimiento */}
      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{tipo === 'ingreso' ? 'Nuevo Ingreso' : 'Nuevo Egreso'} · {currency}</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)} hitSlop={10}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <FieldLabel>Monto ({currency})</FieldLabel>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                keyboardType="decimal-pad"
                value={monto}
                onChangeText={setMonto}
                placeholderTextColor="#999"
              />

              <FieldLabel>Concepto</FieldLabel>
              <TextInput
                style={styles.input}
                placeholder="Describe el movimiento"
                value={concepto}
                onChangeText={setConcepto}
                placeholderTextColor="#999"
              />

              <FieldLabel>Categoría</FieldLabel>
              <View style={styles.catGrid}>
                {(tipo === 'ingreso' ? CATEGORIAS_INGRESO : CATEGORIAS_EGRESO).map(c => (
                  <TouchableOpacity key={c} onPress={() => setCategoria(c)} style={[styles.catChip, categoria === c && styles.catChipActive]}>
                    <Text style={[styles.catChipTxt, categoria === c && { color: '#fff' }]}>{CAT_LABEL[c]}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <FieldLabel>Notas (opcional)</FieldLabel>
              <TextInput
                style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
                placeholder="Información adicional"
                value={notas}
                onChangeText={setNotas}
                multiline
                placeholderTextColor="#999"
              />

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                <TouchableOpacity style={[styles.btn, styles.btnOutline, { flex: 1 }]} onPress={() => setModalOpen(false)}>
                  <Text style={styles.btnOutlineTxt}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, { flex: 1, backgroundColor: tipo === 'ingreso' ? GREEN : RED }]}
                  onPress={save}
                  disabled={saving}
                >
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryTxt}>Guardar</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Header({ onBack, title, subtitle }: { onBack: () => void; title: string; subtitle: string }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.headerBtn} hitSlop={10}>
        <Ionicons name="chevron-back" size={26} color="#fff" />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function Kpi({ label, value, color, icon }: { label: string; value: string; color: string; icon: any }) {
  return (
    <View style={[styles.kpiBox, { borderLeftColor: color }]}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={styles.kpiVal}>{value}</Text>
      <Text style={styles.kpiLbl}>{label}</Text>
    </View>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fieldLbl}>{children}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { backgroundColor: ORANGE, paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  headerBtn: { padding: 6 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  headerSubtitle: { color: '#FFE0D2', fontSize: 12, marginTop: 2 },

  curRow: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#DDD' },
  curChip: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F0F0F0' },
  curChipActive: { backgroundColor: ORANGE },
  curChipTxt: { fontSize: 12, color: '#444', fontWeight: '700' },

  saldoCard: { backgroundColor: '#fff', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  saldoLbl: { fontSize: 12, color: '#666', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: '600' },
  saldoVal: { fontSize: 28, fontWeight: '700', color: '#222', marginTop: 4 },

  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  kpiBox: { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 10, borderLeftWidth: 3, gap: 2 },
  kpiVal: { fontSize: 13, fontWeight: '700', color: '#222', marginTop: 2 },
  kpiLbl: { fontSize: 10, color: '#666' },

  actionsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10 },
  actionBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },

  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  emptyBox: { alignItems: 'center', padding: 30 },
  muted: { color: '#888', marginTop: 8 },

  txRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 8 },
  txIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  txConcepto: { fontSize: 13, fontWeight: '600', color: '#222' },
  txMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  txMonto: { fontSize: 13, fontWeight: '700' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '92%' },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#EEE' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#222' },
  fieldLbl: { fontSize: 11, color: '#888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 10, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#222', backgroundColor: '#fff' },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#F0F0F0' },
  catChipActive: { backgroundColor: ORANGE },
  catChipTxt: { fontSize: 12, color: '#444', fontWeight: '600' },

  btn: { paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  btnOutline: { borderWidth: 1, borderColor: '#DDD', backgroundColor: '#fff' },
  btnOutlineTxt: { color: '#444', fontWeight: '600' },
  btnPrimaryTxt: { color: '#fff', fontWeight: '700' },
});
