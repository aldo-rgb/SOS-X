/**
 * BranchTreasuryScreen — Caja Sucursales
 * -----------------------------------------------------------
 * Tesorería por sucursal: lista las sucursales, al elegir una
 * muestra billeteras con saldos, totales de hoy / mes y top
 * categorías de gasto e ingreso. Permite registrar ingresos
 * simples (sin evidencia). Para egresos con evidencia y
 * cortes de caja se redirige al Panel Web.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
  StatusBar, RefreshControl, Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { API_URL } from '../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'BranchTreasury'>;

const ORANGE = '#F05A28';
const BG = '#F4F6F8';
const GREEN = '#2E7D32';
const RED = '#C62828';

interface Branch { id: number; name: string; code: string; city?: string; }
interface Billetera { id: number; nombre: string; tipo: string; saldo_actual: string; tipo_moneda: string; icono?: string; color?: string; is_default?: boolean; }
interface Categoria { id: number; nombre: string; tipo: 'ingreso' | 'egreso'; color?: string; icono?: string; }
interface Dashboard {
  billeteras: Billetera[];
  saldo_total: number;
  hoy: { ingresos: number; egresos: number; transacciones: number };
  mes: { ingresos: number; egresos: number };
  gastos_por_categoria: Array<{ id: number; nombre: string; color?: string; total: string }>;
  ingresos_por_categoria: Array<{ id: number; nombre: string; color?: string; total: string }>;
}

const money = (n: number | string, c = 'MXN') => `$${Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;

export default function BranchTreasuryScreen({ navigation, route }: Props) {
  const { token } = route.params;
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selected, setSelected] = useState<Branch | null>(null);

  const [loadingDash, setLoadingDash] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  // Modal nuevo ingreso
  const [modalOpen, setModalOpen] = useState(false);
  const [billeteraId, setBilleteraId] = useState<number | null>(null);
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [monto, setMonto] = useState('');
  const [nota, setNota] = useState('');
  const [referencia, setReferencia] = useState('');
  const [saving, setSaving] = useState(false);

  const loadBranches = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/branches`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setBranches(data.branches || []);
    } catch (e: any) {
      Alert.alert('Error', 'No se pudieron cargar las sucursales');
    } finally {
      setLoadingBranches(false);
    }
  }, [token]);

  useEffect(() => { loadBranches(); }, [loadBranches]);

  const loadDashboard = useCallback(async (branch: Branch) => {
    setLoadingDash(true);
    try {
      const [dRes, cRes] = await Promise.all([
        fetch(`${API_URL}/api/tesoreria/sucursal/${branch.id}/dashboard`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/tesoreria/categorias`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const d = await dRes.json();
      const c = await cRes.json();
      setDash(d);
      const cats = Array.isArray(c) ? c : (c.categorias || []);
      setCategorias(cats.filter((x: Categoria) => x.tipo === 'ingreso'));
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo cargar el dashboard');
    } finally {
      setLoadingDash(false);
      setRefreshing(false);
    }
  }, [token]);

  const onSelect = (b: Branch) => { setSelected(b); loadDashboard(b); };
  const onRefresh = () => { if (selected) { setRefreshing(true); loadDashboard(selected); } };

  const openNew = () => {
    if (!dash || dash.billeteras.length === 0) {
      Alert.alert('Sin billeteras', 'Esta sucursal aún no tiene billeteras configuradas. Créalas desde el Panel Web.');
      return;
    }
    setBilleteraId(dash.billeteras[0].id);
    setCategoriaId(categorias[0]?.id || null);
    setMonto('');
    setNota('');
    setReferencia('');
    setModalOpen(true);
  };

  const save = async () => {
    if (!selected) return;
    if (!billeteraId) { Alert.alert('Falta', 'Selecciona una billetera'); return; }
    const m = parseFloat(monto.replace(',', '.'));
    if (!m || m <= 0) { Alert.alert('Monto inválido', 'Ingresa un monto mayor a 0'); return; }
    if (!nota.trim()) { Alert.alert('Descripción requerida', 'Describe el ingreso'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/tesoreria/sucursal/${selected.id}/movimientos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          billetera_id: billeteraId,
          categoria_id: categoriaId,
          tipo_movimiento: 'ingreso',
          monto: m,
          nota_descriptiva: nota.trim(),
          referencia: referencia.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      setModalOpen(false);
      loadDashboard(selected);
      Alert.alert('✅ Guardado', `Ingreso de ${money(m)} registrado en ${selected.name}`);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo registrar');
    } finally {
      setSaving(false);
    }
  };

  // === Lista de sucursales ===
  if (!selected) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <StatusBar barStyle="light-content" backgroundColor={ORANGE} />
        <Header onBack={() => navigation.goBack()} title="Caja Sucursales" subtitle="Selecciona una sucursal" />
        {loadingBranches ? (
          <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 12 }}>
            {branches.map(b => (
              <TouchableOpacity key={b.id} style={styles.branchCard} onPress={() => onSelect(b)} activeOpacity={0.7}>
                <Ionicons name="business-outline" size={22} color={ORANGE} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.branchName}>{b.name}</Text>
                  <Text style={styles.branchMeta}>{b.code}{b.city ? ` · ${b.city}` : ''}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </TouchableOpacity>
            ))}
            {branches.length === 0 && (
              <View style={styles.center}><Text style={styles.muted}>Sin sucursales activas</Text></View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    );
  }

  // === Dashboard de sucursal ===
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={ORANGE} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setSelected(null)} style={styles.headerBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{selected.name}</Text>
          <Text style={styles.headerSubtitle}>{selected.code} · Tesorería</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.headerBtn} hitSlop={10}>
          <Ionicons name="refresh" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {loadingDash || !dash ? (
        <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
        >
          {/* Saldo total */}
          <View style={styles.saldoCard}>
            <Text style={styles.saldoLbl}>Saldo total de billeteras</Text>
            <Text style={[styles.saldoVal, dash.saldo_total < 0 && { color: RED }]}>{money(dash.saldo_total)}</Text>
          </View>

          {/* Billeteras */}
          <Text style={styles.sectionLabel}>Billeteras</Text>
          {dash.billeteras.length === 0 ? (
            <View style={styles.emptyBox}><Text style={styles.muted}>Sin billeteras configuradas</Text></View>
          ) : (
            dash.billeteras.map(b => (
              <View key={b.id} style={styles.billRow}>
                <View style={[styles.billIcon, { backgroundColor: (b.color || '#1976D2') + '22' }]}>
                  <Ionicons name="wallet-outline" size={18} color={b.color || '#1976D2'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.billName}>{b.nombre}</Text>
                  <Text style={styles.billMeta}>{b.tipo} · {b.tipo_moneda}{b.is_default ? ' · Predeterminada' : ''}</Text>
                </View>
                <Text style={[styles.billSaldo, Number(b.saldo_actual) < 0 && { color: RED }]}>{money(b.saldo_actual, b.tipo_moneda)}</Text>
              </View>
            ))
          )}

          {/* KPIs hoy / mes */}
          <View style={{ marginTop: 14 }}>
            <Text style={styles.sectionLabel}>Hoy</Text>
            <View style={styles.kpiRow}>
              <Kpi label="Ingresos" value={money(dash.hoy.ingresos)} color={GREEN} icon="arrow-up-circle" />
              <Kpi label="Egresos" value={money(dash.hoy.egresos)} color={RED} icon="arrow-down-circle" />
              <Kpi label="Movs" value={String(dash.hoy.transacciones)} color="#1976D2" icon="swap-vertical" />
            </View>
            <Text style={styles.sectionLabel}>Mes</Text>
            <View style={styles.kpiRow}>
              <Kpi label="Ingresos" value={money(dash.mes.ingresos)} color={GREEN} icon="trending-up" />
              <Kpi label="Egresos" value={money(dash.mes.egresos)} color={RED} icon="trending-down" />
              <Kpi label="Neto" value={money(dash.mes.ingresos - dash.mes.egresos)} color="#7B1FA2" icon="cash-outline" />
            </View>
          </View>

          {/* Gastos por categoría */}
          {dash.gastos_por_categoria.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Top gastos del mes</Text>
              {dash.gastos_por_categoria.slice(0, 5).map(g => (
                <View key={g.id} style={styles.catRow}>
                  <View style={[styles.catDot, { backgroundColor: g.color || RED }]} />
                  <Text style={[styles.catName, { flex: 1 }]} numberOfLines={1}>{g.nombre}</Text>
                  <Text style={styles.catVal}>{money(g.total)}</Text>
                </View>
              ))}
            </>
          )}

          {/* Acción: nuevo ingreso */}
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: GREEN, marginTop: 16 }]} onPress={openNew}>
            <Ionicons name="add-circle-outline" size={20} color="#fff" />
            <Text style={styles.actionBtnTxt}>Registrar Ingreso</Text>
          </TouchableOpacity>

          <View style={styles.note}>
            <Ionicons name="information-circle-outline" size={16} color="#1565C0" />
            <Text style={styles.noteTxt}>
              Los egresos requieren evidencia (foto) y los cortes de caja se gestionan desde el Panel Web.
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Modal nuevo ingreso */}
      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Nuevo Ingreso · {selected.name}</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)} hitSlop={10}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <FieldLabel>Billetera</FieldLabel>
              <View style={styles.catGrid}>
                {dash?.billeteras.map(b => (
                  <TouchableOpacity key={b.id} onPress={() => setBilleteraId(b.id)} style={[styles.catChip, billeteraId === b.id && styles.catChipActive]}>
                    <Text style={[styles.catChipTxt, billeteraId === b.id && { color: '#fff' }]}>{b.nombre} ({b.tipo_moneda})</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <FieldLabel>Monto</FieldLabel>
              <TextInput style={styles.input} placeholder="0.00" keyboardType="decimal-pad" value={monto} onChangeText={setMonto} placeholderTextColor="#999" />

              <FieldLabel>Categoría</FieldLabel>
              <View style={styles.catGrid}>
                <TouchableOpacity onPress={() => setCategoriaId(null)} style={[styles.catChip, categoriaId === null && styles.catChipActive]}>
                  <Text style={[styles.catChipTxt, categoriaId === null && { color: '#fff' }]}>Sin categoría</Text>
                </TouchableOpacity>
                {categorias.map(c => (
                  <TouchableOpacity key={c.id} onPress={() => setCategoriaId(c.id)} style={[styles.catChip, categoriaId === c.id && styles.catChipActive]}>
                    <Text style={[styles.catChipTxt, categoriaId === c.id && { color: '#fff' }]}>{c.nombre}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <FieldLabel>Descripción</FieldLabel>
              <TextInput style={styles.input} placeholder="Concepto del ingreso" value={nota} onChangeText={setNota} placeholderTextColor="#999" />

              <FieldLabel>Referencia (opcional)</FieldLabel>
              <TextInput style={styles.input} placeholder="No. de operación, ticket, etc." value={referencia} onChangeText={setReferencia} placeholderTextColor="#999" />

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                <TouchableOpacity style={[styles.btn, styles.btnOutline, { flex: 1 }]} onPress={() => setModalOpen(false)}>
                  <Text style={styles.btnOutlineTxt}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: GREEN }]} onPress={save} disabled={saving}>
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
      <Ionicons name={icon} size={14} color={color} />
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  muted: { color: '#888' },
  header: { backgroundColor: ORANGE, paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  headerBtn: { padding: 6 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  headerSubtitle: { color: '#FFE0D2', fontSize: 12, marginTop: 2 },

  branchCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', padding: 14, borderRadius: 10, marginBottom: 8 },
  branchName: { fontSize: 14, fontWeight: '700', color: '#222' },
  branchMeta: { fontSize: 12, color: '#666', marginTop: 2 },

  saldoCard: { backgroundColor: '#fff', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 14 },
  saldoLbl: { fontSize: 12, color: '#666', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: '600' },
  saldoVal: { fontSize: 26, fontWeight: '700', color: '#222', marginTop: 4 },

  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 6, marginBottom: 6 },

  billRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 6 },
  billIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  billName: { fontSize: 13, fontWeight: '700', color: '#222' },
  billMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  billSaldo: { fontSize: 13, fontWeight: '700', color: GREEN },

  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  kpiBox: { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 10, borderLeftWidth: 3 },
  kpiVal: { fontSize: 12, fontWeight: '700', color: '#222', marginTop: 2 },
  kpiLbl: { fontSize: 10, color: '#666' },

  catRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', padding: 10, borderRadius: 8, marginBottom: 4 },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catName: { fontSize: 13, color: '#222' },
  catVal: { fontSize: 13, fontWeight: '700', color: RED },

  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10 },
  actionBtnTxt: { color: '#fff', fontWeight: '700' },

  emptyBox: { alignItems: 'center', padding: 20, backgroundColor: '#fff', borderRadius: 10 },

  note: { flexDirection: 'row', gap: 8, padding: 10, backgroundColor: '#E3F2FD', borderRadius: 8, marginTop: 12 },
  noteTxt: { flex: 1, fontSize: 11, color: '#1565C0' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '92%' },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#EEE' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#222' },
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
