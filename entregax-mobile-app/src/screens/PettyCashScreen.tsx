/**
 * PettyCashScreen - Caja Chica del Monitorista
 *
 * Flujo de bloques de ruta:
 *  1) "Registrar gasto" abre el hub de bloques
 *  2) El usuario puede crear un nuevo bloque seleccionando contenedores activos
 *  3) Cada gasto se registra vinculado a un bloque
 *  4) Al finalizar la ruta, "Finalizar bloque" divide los gastos entre contenedores
 *     y suma el monto a custody_amount en container_costs
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Image,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { API_URL, api } from '../services/api';

// ─── Types ───────────────────────────────────────────────────────────────────

type Advance = {
  id: number;
  amount_mxn: string | number;
  concept: string | null;
  issued_at: string;
  status: string;
  issued_by_name?: string | null;
  branch_name?: string | null;
};

type Movement = {
  id: number;
  movement_type: string;
  category: string | null;
  amount_mxn: string | number;
  status: string;
  concept: string | null;
  created_at: string;
  evidence_url: string | null;
};

type Wallet = {
  id: number;
  balance_mxn: string | number;
  pending_to_verify_mxn: string | number;
  branch_name?: string | null;
};

type ContainerInfo = {
  id: number;
  container_number: string;
  bl_number: string | null;
  status: string;
};

type RouteBlock = {
  id: number;
  status: string;
  notes: string | null;
  created_at: string;
  containers: ContainerInfo[];
  total_expenses: string | number;
  expense_count: string | number;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORIES: { key: string; label: string; icon: string }[] = [
  { key: 'caseta', label: 'Casetas', icon: '🛣️' },
  { key: 'combustible', label: 'Combustible', icon: '⛽' },
  { key: 'mecanica', label: 'Mecánica', icon: '🛠️' },
  { key: 'alimentos', label: 'Alimentos', icon: '🍔' },
  { key: 'hospedaje', label: 'Hospedaje', icon: '🏨' },
  { key: 'estacionamiento', label: 'Estacionamiento', icon: '🅿️' },
  { key: 'papeleria', label: 'Papelería', icon: '📎' },
  { key: 'mensajeria', label: 'Mensajería', icon: '📦' },
  { key: 'lavado', label: 'Lavado', icon: '🚿' },
  { key: 'refacciones', label: 'Refacciones', icon: '🔩' },
  { key: 'hidratacion', label: 'Hielo/Agua', icon: '💧' },
  { key: 'peaje_internacional', label: 'Peaje internacional', icon: '🛂' },
  { key: 'otros', label: 'Otros', icon: '📝' },
];

const ODOMETER_CATS = ['combustible', 'mecanica', 'refacciones'];

const fmtMoney = (n: any) =>
  `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (s: string) => {
  try {
    const d = new Date(s);
    return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return s;
  }
};

const statusLabel: Record<string, string> = {
  customs_cleared: 'Liberado de aduana',
  in_transit_clientfinal: 'En tránsito',
  delivered: 'Entregado',
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function PettyCashScreen({ navigation, route }: any) {
  const token = route?.params?.token;
  const insets = useSafeAreaInsets();
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

  // Main data
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [openBlocks, setOpenBlocks] = useState<RouteBlock[]>([]);

  // Hub modal (bloques abiertos)
  const [hubOpen, setHubOpen] = useState(false);

  // Wizard: seleccionar contenedores para nuevo bloque
  const [wizardOpen, setWizardOpen] = useState(false);
  const [availableContainers, setAvailableContainers] = useState<ContainerInfo[]>([]);
  const [selectedContainerIds, setSelectedContainerIds] = useState<number[]>([]);
  const [wizardLoading, setWizardLoading] = useState(false);
  const [wizardSaving, setWizardSaving] = useState(false);

  // Modal: Registrar gasto
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [activeBlockId, setActiveBlockId] = useState<number | null>(null);
  // Bloque pendiente de abrir una vez que el hub se cierre (dos modales simultáneos no funcionan en iOS)
  const [pendingExpenseBlockId, setPendingExpenseBlockId] = useState<number | null>(null);
  const [expCategory, setExpCategory] = useState<string>('combustible');
  const [expAmount, setExpAmount] = useState('');
  const [expConcept, setExpConcept] = useState('');
  const [expOdometer, setExpOdometer] = useState('');
  const [expPhoto, setExpPhoto] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [expSaving, setExpSaving] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const [walletRes, blocksRes] = await Promise.all([
        api.get('/api/petty-cash/my-wallet', { headers: authHeaders }),
        api.get('/api/petty-cash/route-blocks', { headers: authHeaders }),
      ]);
      setWallet(walletRes.data?.wallet || null);
      setAdvances(walletRes.data?.pending_advances || []);
      setMovements(walletRes.data?.movements || []);
      setOpenBlocks(blocksRes.data?.blocks || []);
    } catch (err: any) {
      console.error('PettyCash loadData error', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));
  const onRefresh = () => { setRefreshing(true); loadData(); };

  // Abrir expense form después de que el hub se cierre
  useEffect(() => {
    if (!hubOpen && pendingExpenseBlockId !== null) {
      openExpenseForm(pendingExpenseBlockId);
      setPendingExpenseBlockId(null);
    }
  }, [hubOpen, pendingExpenseBlockId]);

  // ── Hub ───────────────────────────────────────────────────────────────────

  const openHub = () => setHubOpen(true);

  // ── Wizard: crear nuevo bloque ────────────────────────────────────────────

  const openNewBlockWizard = async () => {
    setWizardLoading(true);
    setWizardOpen(true);
    setSelectedContainerIds([]);
    try {
      const res = await api.get('/api/monitoreo/containers?status=all', { headers: authHeaders });
      const containers: ContainerInfo[] = (res.data?.containers || []).map((c: any) => ({
        id: c.id,
        container_number: c.container_number,
        bl_number: c.bl_number,
        status: c.status,
      }));
      setAvailableContainers(containers);
      // Pre-seleccionar todos
      setSelectedContainerIds(containers.map((c) => c.id));
    } catch {
      Alert.alert('Error', 'No se pudieron cargar los contenedores');
      setWizardOpen(false);
    } finally {
      setWizardLoading(false);
    }
  };

  const toggleContainer = (id: number) => {
    setSelectedContainerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const createBlock = async () => {
    if (selectedContainerIds.length === 0) {
      Alert.alert('Selecciona al menos un contenedor');
      return;
    }
    setWizardSaving(true);
    try {
      const res = await api.post('/api/petty-cash/route-blocks', {
        container_ids: selectedContainerIds,
      }, { headers: authHeaders });
      const blockId = res.data?.block_id;
      setWizardOpen(false);
      await loadData();
      // Abrir directamente el formulario de gasto con el nuevo bloque
      openExpenseForm(blockId);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error || 'No se pudo crear el bloque');
    } finally {
      setWizardSaving(false);
    }
  };

  // ── Expense form ──────────────────────────────────────────────────────────

  const openExpenseForm = (blockId: number) => {
    setActiveBlockId(blockId);
    setExpCategory('combustible');
    setExpAmount('');
    setExpConcept('');
    setExpOdometer('');
    setExpPhoto(null);
    setExpenseOpen(true);
  };

  const pickPhoto = async (fromCamera: boolean) => {
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permiso requerido', 'Necesitamos acceso para capturar el ticket.');
        return;
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (result.canceled || !result.assets?.length) return;
      const a = result.assets[0];
      setExpPhoto({ uri: a.uri, name: a.fileName || `ticket-${Date.now()}.jpg`, type: a.mimeType || 'image/jpeg' });
    } catch {
      Alert.alert('Error', 'No se pudo obtener la foto');
    }
  };

  const submitExpense = async () => {
    const amount = Number(expAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) { Alert.alert('Monto inválido', 'Captura un monto mayor a $0'); return; }
    if (!expPhoto) { Alert.alert('Foto requerida', 'Toma una foto del ticket o factura'); return; }
    setExpSaving(true);
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      let acc: number | null = null;
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
          acc = pos.coords.accuracy ?? null;
        }
      } catch { /* GPS no obligatorio */ }

      const form = new FormData();
      form.append('category', expCategory);
      form.append('amount_mxn', String(amount));
      if (expConcept) form.append('concept', expConcept);
      if (lat != null) form.append('gps_lat', String(lat));
      if (lng != null) form.append('gps_lng', String(lng));
      if (acc != null) form.append('gps_accuracy_m', String(acc));
      if (expOdometer) form.append('odometer_km', expOdometer);
      if (activeBlockId) form.append('route_block_id', String(activeBlockId));
      // @ts-ignore: RN FormData file
      form.append('evidence', { uri: expPhoto.uri, name: expPhoto.name, type: expPhoto.type });

      const res = await fetch(`${API_URL}/api/petty-cash/expenses`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: form as any,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'No se pudo registrar el gasto');
      Alert.alert('✅ Gasto registrado', 'Tu gasto quedó pendiente de aprobación.');
      setExpenseOpen(false);
      setHubOpen(false);
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo registrar el gasto');
    } finally {
      setExpSaving(false);
    }
  };

  // ── Finalizar bloque ──────────────────────────────────────────────────────

  const finalizeBlock = (block: RouteBlock) => {
    const total = Number(block.total_expenses);
    const count = block.containers.length;
    const perCont = count > 0 ? (total / count).toFixed(2) : '0.00';
    Alert.alert(
      '¿Finalizar bloque?',
      `Total gastos: ${fmtMoney(total)}\nContenedores: ${count}\nCustodia por contenedor: $${perCont} MXN\n\nEste monto se sumará al campo Custodia de cada contenedor.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post(`/api/petty-cash/route-blocks/${block.id}/finalize`, {}, { headers: authHeaders });
              Alert.alert('✅ Bloque finalizado', `Se distribuyeron $${perCont} MXN de custodia en ${count} contenedor(es).`);
              loadData();
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.error || 'No se pudo finalizar el bloque');
            }
          },
        },
      ]
    );
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const acceptAdvance = async (adv: Advance) => {
    Alert.alert(
      'Aceptar vale',
      `¿Confirmas la recepción de ${fmtMoney(adv.amount_mxn)}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aceptar',
          onPress: async () => {
            try {
              let lat: number | null = null; let lng: number | null = null;
              try {
                const perm = await Location.requestForegroundPermissionsAsync();
                if (perm.status === 'granted') {
                  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                  lat = pos.coords.latitude; lng = pos.coords.longitude;
                }
              } catch { /* GPS no obligatorio */ }
              await api.post(`/api/petty-cash/advances/${adv.id}/accept`, {
                lat, lng, device_info: `${Platform.OS} ${Platform.Version}`,
              }, { headers: authHeaders });
              Alert.alert('✅ Aceptado', 'El vale fue aceptado y firmado.');
              loadData();
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.error || 'No se pudo aceptar el vale');
            }
          },
        },
      ]
    );
  };

  const statusChip = (status: string) => {
    const map: Record<string, { bg: string; color: string; label: string }> = {
      pending: { bg: '#FFF3CD', color: '#856404', label: 'Pendiente' },
      approved: { bg: '#D4EDDA', color: '#155724', label: 'Aprobado' },
      rejected: { bg: '#F8D7DA', color: '#721C24', label: 'Rechazado' },
    };
    const m = map[status] || { bg: '#eee', color: '#444', label: status };
    return (
      <View style={[styles.chip, { backgroundColor: m.bg }]}>
        <Text style={[styles.chipText, { color: m.color }]}>{m.label}</Text>
      </View>
    );
  };

  // ─── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#F05A28" />
          <Text style={styles.loadingText}>Cargando caja chica...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const balance = Number(wallet?.balance_mxn || 0);
  const pendingVerify = Number(wallet?.pending_to_verify_mxn || 0);

  // ─── Active block for expense form label ──────────────────────────────────
  const activeBlock = openBlocks.find((b) => b.id === activeBlockId);

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={28} color="#333" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Caja Chica</Text>
          {wallet?.branch_name ? <Text style={styles.headerSubtitle}>{wallet.branch_name}</Text> : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#F05A28']} />}
      >
        {/* ── Saldo principal ── */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Saldo disponible</Text>
          <Text style={styles.balanceAmount}>{fmtMoney(balance)}</Text>
          <View style={styles.balanceFooter}>
            <MaterialIcons name="hourglass-empty" size={16} color="rgba(255,255,255,0.85)" />
            <Text style={styles.balanceFooterText}>Por comprobar: {fmtMoney(pendingVerify)}</Text>
          </View>
        </View>

        {/* ── Botón principal ── */}
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#F05A28' }]} onPress={openHub} activeOpacity={0.85}>
          <MaterialIcons name="receipt-long" size={22} color="#fff" />
          <Text style={styles.actionBtnText}>Registrar gasto / Comprobar</Text>
        </TouchableOpacity>

        {/* ── Bloques abiertos (resumen en pantalla principal) ── */}
        {openBlocks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🚛 Bloques de ruta activos</Text>
            {openBlocks.map((block) => (
              <View key={block.id} style={styles.blockCard}>
                <View style={styles.blockHeader}>
                  <Text style={styles.blockDate}>Bloque #{block.id} · {fmtDate(block.created_at)}</Text>
                  <Text style={styles.blockTotal}>{fmtMoney(block.total_expenses)}</Text>
                </View>
                <Text style={styles.blockContainers} numberOfLines={2}>
                  {block.containers.map((c) => c.container_number).join(' · ') || 'Sin contenedores'}
                </Text>
                <Text style={styles.blockExpCount}>
                  {Number(block.expense_count)} gasto(s) · {block.containers.length} contenedor(es)
                </Text>
                <View style={styles.blockActions}>
                  <TouchableOpacity style={styles.blockAddBtn} onPress={() => { setHubOpen(true); }}>
                    <MaterialIcons name="add-circle-outline" size={16} color="#F05A28" />
                    <Text style={styles.blockAddBtnText}>Agregar gasto</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.blockFinalizeBtn} onPress={() => finalizeBlock(block)}>
                    <MaterialIcons name="check-circle-outline" size={16} color="#fff" />
                    <Text style={styles.blockFinalizeBtnText}>Finalizar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Vales pendientes ── */}
        {advances.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📥 Vales por aceptar</Text>
            {advances.map((a) => (
              <View key={a.id} style={styles.advanceCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.advanceAmount}>{fmtMoney(a.amount_mxn)}</Text>
                  {a.concept ? <Text style={styles.advanceConcept}>{a.concept}</Text> : null}
                  <Text style={styles.advanceMeta}>
                    {a.issued_by_name ? `Emitido por ${a.issued_by_name}` : 'Anticipo'} · {fmtDate(a.issued_at)}
                  </Text>
                </View>
                <TouchableOpacity style={styles.acceptBtn} onPress={() => acceptAdvance(a)}>
                  <MaterialIcons name="check" size={18} color="#fff" />
                  <Text style={styles.acceptBtnText}>Aceptar</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* ── Historial ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🕒 Movimientos recientes</Text>
          {movements.length === 0 ? (
            <View style={styles.emptyBox}>
              <MaterialIcons name="inbox" size={32} color="#bbb" />
              <Text style={styles.emptyText}>Sin movimientos aún</Text>
            </View>
          ) : (
            movements.map((m) => {
              const cat = CATEGORIES.find((c) => c.key === m.category);
              const isExpense = m.movement_type === 'expense';
              return (
                <View key={m.id} style={styles.movCard}>
                  <View style={styles.movIcon}>
                    <Text style={{ fontSize: 22 }}>
                      {isExpense ? cat?.icon || '🧾' : m.movement_type === 'fund' || m.movement_type === 'advance' ? '💵' : '🔁'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.movTitle} numberOfLines={1}>
                      {isExpense ? cat?.label || m.category || 'Gasto' : m.movement_type === 'advance' ? 'Anticipo recibido' : m.movement_type === 'fund' ? 'Fondeo' : 'Movimiento'}
                    </Text>
                    {m.concept ? <Text style={styles.movConcept} numberOfLines={1}>{m.concept}</Text> : null}
                    <Text style={styles.movDate}>{fmtDate(m.created_at)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.movAmount, { color: isExpense ? '#E53935' : '#00B894' }]}>
                      {isExpense ? '-' : '+'}{fmtMoney(m.amount_mxn)}
                    </Text>
                    {statusChip(m.status)}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL: HUB DE BLOQUES
          ═══════════════════════════════════════════════════════════════════════ */}
      <Modal visible={hubOpen} animationType="slide" onRequestClose={() => setHubOpen(false)}>
        <SafeAreaView style={styles.container}>
          <View style={[styles.header, { paddingTop: insets.top > 0 ? insets.top : 12 }]}>
            <TouchableOpacity onPress={() => setHubOpen(false)}>
              <MaterialIcons name="close" size={28} color="#333" />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { marginLeft: 12 }]}>Bloques de ruta</Text>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {/* Botón nuevo bloque — solo si no hay bloque activo */}
            {openBlocks.length === 0 ? (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#2196F3' }]}
                onPress={() => { setHubOpen(false); openNewBlockWizard(); }}
                activeOpacity={0.85}
              >
                <MaterialIcons name="add-circle-outline" size={22} color="#fff" />
                <Text style={styles.actionBtnText}>+ Nuevo bloque de ruta</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.actionBtn, { backgroundColor: '#B0BEC5' }]}>
                <MaterialIcons name="lock-outline" size={20} color="#fff" />
                <Text style={styles.actionBtnText}>Ya tienes un bloque activo</Text>
              </View>
            )}

            {openBlocks.length === 0 ? (
              <View style={[styles.emptyBox, { marginTop: 24 }]}>
                <MaterialIcons name="local-shipping" size={40} color="#bbb" />
                <Text style={[styles.emptyText, { marginTop: 8, textAlign: 'center' }]}>
                  No hay bloques abiertos.{'\n'}Crea uno para empezar a registrar gastos.
                </Text>
              </View>
            ) : (
              openBlocks.map((block) => {
                const total = Number(block.total_expenses);
                const count = block.containers.length;
                return (
                  <View key={block.id} style={styles.hubBlockCard}>
                    <View style={styles.blockHeader}>
                      <Text style={styles.blockDate}>Bloque #{block.id}</Text>
                      <Text style={styles.blockDate}>{fmtDate(block.created_at)}</Text>
                    </View>

                    {/* Contenedores */}
                    {block.containers.map((c) => (
                      <View key={c.id} style={styles.hubContainerRow}>
                        <MaterialIcons name="directions-boat" size={14} color="#555" />
                        <Text style={styles.hubContainerText}>{c.container_number}</Text>
                        <Text style={styles.hubContainerStatus}>{statusLabel[c.status] || c.status}</Text>
                      </View>
                    ))}

                    <View style={styles.hubBlockFooter}>
                      <Text style={styles.hubBlockTotalLabel}>
                        {Number(block.expense_count)} gasto(s) · Total:
                      </Text>
                      <Text style={styles.hubBlockTotal}>{fmtMoney(total)}</Text>
                    </View>
                    {count > 0 && (
                      <Text style={styles.hubBlockPerCont}>
                        ÷ {count} contenedor(es) = {fmtMoney(total / count)} c/u
                      </Text>
                    )}

                    <View style={styles.blockActions}>
                      <TouchableOpacity
                        style={styles.blockAddBtn}
                        onPress={() => { setHubOpen(false); setPendingExpenseBlockId(block.id); }}
                      >
                        <MaterialIcons name="add" size={16} color="#F05A28" />
                        <Text style={styles.blockAddBtnText}>Agregar gasto</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.blockFinalizeBtn}
                        onPress={() => { setHubOpen(false); finalizeBlock(block); }}
                      >
                        <MaterialIcons name="check-circle-outline" size={16} color="#fff" />
                        <Text style={styles.blockFinalizeBtnText}>Finalizar ruta</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL: WIZARD — SELECCIONAR CONTENEDORES
          ═══════════════════════════════════════════════════════════════════════ */}
      <Modal visible={wizardOpen} animationType="slide" onRequestClose={() => setWizardOpen(false)}>
        <SafeAreaView style={styles.container}>
          <View style={[styles.header, { paddingTop: insets.top > 0 ? insets.top : 12 }]}>
            <TouchableOpacity onPress={() => setWizardOpen(false)} disabled={wizardSaving}>
              <MaterialIcons name="arrow-back" size={28} color="#333" />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { marginLeft: 12 }]}>Contenedores en ruta</Text>
          </View>

          {wizardLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#2196F3" />
              <Text style={styles.loadingText}>Cargando contenedores...</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
              <Text style={styles.wizardHint}>
                Selecciona los contenedores que forman este bloque de ruta. Los gastos se dividirán entre ellos al finalizar.
              </Text>

              {availableContainers.length === 0 ? (
                <View style={[styles.emptyBox, { marginTop: 24 }]}>
                  <MaterialIcons name="directions-boat" size={40} color="#bbb" />
                  <Text style={[styles.emptyText, { textAlign: 'center', marginTop: 8 }]}>
                    No tienes contenedores activos asignados.
                  </Text>
                </View>
              ) : (
                availableContainers.map((c) => {
                  const selected = selectedContainerIds.includes(c.id);
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.containerRow, selected && styles.containerRowSelected]}
                      onPress={() => toggleContainer(c.id)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                        {selected && <MaterialIcons name="check" size={14} color="#fff" />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.containerNumber}>{c.container_number}</Text>
                        {c.bl_number ? <Text style={styles.containerBl}>BL: {c.bl_number}</Text> : null}
                      </View>
                      <Text style={[styles.containerStatus, { color: c.status === 'in_transit_clientfinal' ? '#F05A28' : '#2196F3' }]}>
                        {statusLabel[c.status] || c.status}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}

              {availableContainers.length > 0 && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#2196F3', marginTop: 24 }, (wizardSaving || selectedContainerIds.length === 0) && { opacity: 0.5 }]}
                  onPress={createBlock}
                  disabled={wizardSaving || selectedContainerIds.length === 0}
                >
                  {wizardSaving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <MaterialIcons name="check-circle-outline" size={22} color="#fff" />
                      <Text style={styles.actionBtnText}>Crear bloque ({selectedContainerIds.length} contenedor{selectedContainerIds.length !== 1 ? 'es' : ''})</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL: REGISTRAR GASTO
          ═══════════════════════════════════════════════════════════════════════ */}
      <Modal visible={expenseOpen} animationType="slide" onRequestClose={() => setExpenseOpen(false)}>
        <SafeAreaView style={styles.container}>
          <View style={[styles.header, { paddingTop: insets.top > 0 ? insets.top : 12 }]}>
            <TouchableOpacity onPress={() => setExpenseOpen(false)} disabled={expSaving}>
              <MaterialIcons name="close" size={28} color="#333" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.headerTitle}>Registrar gasto</Text>
              {activeBlock && (
                <Text style={styles.headerSubtitle}>
                  Bloque #{activeBlock.id} · {activeBlock.containers.map((c) => c.container_number).join(', ')}
                </Text>
              )}
            </View>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            <Text style={styles.label}>Categoría</Text>
            <View style={styles.catGrid}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c.key}
                  style={[styles.catChip, expCategory === c.key && styles.catChipActive]}
                  onPress={() => { setExpCategory(c.key); if (!ODOMETER_CATS.includes(c.key)) setExpOdometer(''); }}
                >
                  <Text style={{ fontSize: 18 }}>{c.icon}</Text>
                  <Text style={[styles.catChipText, expCategory === c.key && { color: '#fff' }]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Monto (MXN)</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              placeholder="0.00"
              value={expAmount}
              onChangeText={setExpAmount}
            />

            <Text style={styles.label}>Concepto (opcional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej. Comida en ruta a CDMX"
              value={expConcept}
              onChangeText={setExpConcept}
            />

            {ODOMETER_CATS.includes(expCategory) && (
              <>
                <Text style={styles.label}>Odómetro KM (opcional)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="123456"
                  value={expOdometer}
                  onChangeText={setExpOdometer}
                />
              </>
            )}

            <Text style={styles.label}>Foto del ticket *</Text>
            {expPhoto ? (
              <View style={styles.photoBox}>
                <Image source={{ uri: expPhoto.uri }} style={styles.photoPreview} />
                <TouchableOpacity style={styles.photoChange} onPress={() => setExpPhoto(null)}>
                  <MaterialIcons name="close" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.photoActions}>
                <TouchableOpacity style={styles.photoBtn} onPress={() => pickPhoto(true)}>
                  <MaterialIcons name="photo-camera" size={22} color="#F05A28" />
                  <Text style={styles.photoBtnText}>Tomar foto</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoBtn} onPress={() => pickPhoto(false)}>
                  <MaterialIcons name="photo-library" size={22} color="#F05A28" />
                  <Text style={styles.photoBtnText}>Galería</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#00B894', marginTop: 22 }, expSaving && { opacity: 0.6 }]}
              onPress={submitExpense}
              disabled={expSaving}
            >
              {expSaving ? <ActivityIndicator color="#fff" /> : (
                <>
                  <MaterialIcons name="cloud-upload" size={22} color="#fff" />
                  <Text style={styles.actionBtnText}>Enviar gasto</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 10, color: '#666' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#222' },
  headerSubtitle: { fontSize: 12, color: '#666', marginTop: 2 },

  balanceCard: {
    backgroundColor: '#00B894',
    borderRadius: 16,
    padding: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  balanceLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  balanceAmount: { color: '#fff', fontSize: 36, fontWeight: 'bold', marginTop: 6 },
  balanceFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6 },
  balanceFooterText: { color: 'rgba(255,255,255,0.9)', fontSize: 12 },

  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  actionBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },

  section: { marginTop: 22 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#222', marginBottom: 10 },

  // Block cards (main screen)
  blockCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
    elevation: 1,
  },
  blockHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  blockDate: { fontSize: 12, color: '#666' },
  blockTotal: { fontSize: 16, fontWeight: 'bold', color: '#222' },
  blockContainers: { fontSize: 13, color: '#333', marginBottom: 2 },
  blockExpCount: { fontSize: 11, color: '#999', marginBottom: 8 },
  blockActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  blockAddBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#F05A28',
    borderRadius: 8,
    paddingVertical: 8,
  },
  blockAddBtnText: { color: '#F05A28', fontSize: 13, fontWeight: 'bold' },
  blockFinalizeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#00B894',
    borderRadius: 8,
    paddingVertical: 8,
  },
  blockFinalizeBtnText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },

  // Hub block cards (inside modal)
  hubBlockCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  hubContainerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  hubContainerText: { flex: 1, fontSize: 13, fontWeight: 'bold', color: '#333' },
  hubContainerStatus: { fontSize: 11, color: '#888' },
  hubBlockFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  hubBlockTotalLabel: { fontSize: 13, color: '#666' },
  hubBlockTotal: { fontSize: 18, fontWeight: 'bold', color: '#222' },
  hubBlockPerCont: { fontSize: 12, color: '#888', marginBottom: 8 },

  // Advances
  advanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3CD',
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
  },
  advanceAmount: { fontSize: 20, fontWeight: 'bold', color: '#222' },
  advanceConcept: { fontSize: 13, color: '#444', marginTop: 2 },
  advanceMeta: { fontSize: 11, color: '#777', marginTop: 4 },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#00B894',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  acceptBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

  emptyBox: { alignItems: 'center', padding: 24, backgroundColor: '#fff', borderRadius: 12 },
  emptyText: { color: '#999', marginTop: 6 },

  movCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  movIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  movTitle: { fontSize: 14, fontWeight: 'bold', color: '#222' },
  movConcept: { fontSize: 12, color: '#666', marginTop: 2 },
  movDate: { fontSize: 11, color: '#999', marginTop: 4 },
  movAmount: { fontSize: 15, fontWeight: 'bold' },

  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginTop: 4 },
  chipText: { fontSize: 10, fontWeight: 'bold' },

  // Expense form
  label: { fontSize: 13, fontWeight: 'bold', color: '#444', marginTop: 14, marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  catChipActive: { backgroundColor: '#F05A28', borderColor: '#F05A28' },
  catChipText: { fontSize: 12, color: '#444' },

  photoActions: { flexDirection: 'row', gap: 10 },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#F05A28',
    borderStyle: 'dashed',
  },
  photoBtnText: { color: '#F05A28', fontWeight: 'bold' },
  photoBox: { position: 'relative', alignItems: 'center' },
  photoPreview: { width: '100%', height: 220, borderRadius: 12, resizeMode: 'cover' },
  photoChange: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
    padding: 6,
  },

  // Wizard
  wizardHint: { fontSize: 13, color: '#555', marginBottom: 16, lineHeight: 18 },
  containerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  containerRowSelected: { borderColor: '#2196F3', backgroundColor: '#E3F2FD' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#bbb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
  containerNumber: { fontSize: 14, fontWeight: 'bold', color: '#222' },
  containerBl: { fontSize: 11, color: '#888', marginTop: 2 },
  containerStatus: { fontSize: 11, fontWeight: 'bold' },
});
