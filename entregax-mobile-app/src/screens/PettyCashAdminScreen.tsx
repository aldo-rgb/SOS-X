/**
 * PettyCashAdminScreen - Caja Chica (vista Sucursal / Operaciones)
 *
 * Para roles que administran la caja chica de una sucursal:
 *  - Ver la sucursal asignada y su saldo disponible.
 *  - Enviar anticipos (vales digitales) a choferes.
 *  - Ver información de los choferes y sus saldos.
 *  - Aprobar / rechazar gastos pendientes.
 *  - Ver el historial de movimientos de la sucursal.
 */

import React, { useCallback, useRef, useState } from 'react';
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { api, API_URL } from '../services/api';
import { parseMontoEs } from '../utils/parseMontoEs';

const ORANGE = '#F05A28';
const GREEN = '#00B894';

type Wallet = {
  id: number;
  owner_type: 'branch' | 'driver';
  owner_id: number;
  owner_name: string;
  branch_id: number | null;
  branch_name: string | null;
  owner_phone: string | null;
  balance_mxn: string | number;
  pending_to_verify_mxn: string | number;
  pending_expenses_count: string | number;
  total_spent_mxn?: string | number;
  status: string;
  currency?: string;
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
  odometer_photo_url: string | null;
  odometer_km: number | null;
  gps_lat: number | null;
  gps_lng: number | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  branch_name?: string | null;
  advance_status?: string | null;
};

type DriverOption = {
  id: number;
  full_name: string;
  role: string;
  phone: string | null;
};

type Stats = {
  branches_balance: number;
  drivers_balance: number;
  drivers_pending_to_verify: number;
  pending_approvals_count: number;
  pending_approvals_total: number;
  total_spent_mxn?: number;
  user_role?: string;
};

const CATEGORIES: Record<string, { label: string; icon: string }> = {
  caseta: { label: 'Casetas', icon: '🛣️' },
  combustible: { label: 'Combustible', icon: '⛽' },
  mecanica: { label: 'Mecánica', icon: '🛠️' },
  alimentos: { label: 'Alimentos', icon: '🍔' },
  hospedaje: { label: 'Hospedaje', icon: '🏨' },
  estacionamiento: { label: 'Estacionamiento', icon: '🅿️' },
  papeleria: { label: 'Papelería', icon: '📎' },
  mensajeria: { label: 'Mensajería', icon: '📦' },
  lavado: { label: 'Lavado', icon: '🚿' },
  refacciones: { label: 'Refacciones', icon: '🔩' },
  hidratacion: { label: 'Hielo/Agua', icon: '💧' },
  peaje_internacional: { label: 'Peaje internacional', icon: '🛂' },
  propina: { label: 'Propina', icon: '💵' },
  impuestos_dhl: { label: 'Impuestos DHL', icon: '📮' },
  otros: { label: 'Otros', icon: '📝' },
};

const MOVEMENT_LABELS: Record<string, string> = {
  fund: 'Fondeo recibido',
  advance: 'Anticipo a chofer',
  expense: 'Gasto',
  return: 'Devolución',
  adjustment: 'Ajuste',
};

const INFLOW_TYPES = ['fund', 'return', 'adjustment'];

const fmtMoney = (n: any) =>
  `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (s: string) => {
  try {
    return new Date(s).toLocaleString('es-MX', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return s;
  }
};

const statusMeta = (status: string) => {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    pending: { bg: '#FFF3CD', color: '#856404', label: 'Pendiente' },
    approved: { bg: '#D4EDDA', color: '#155724', label: 'Aprobado' },
    rejected: { bg: '#F8D7DA', color: '#721C24', label: 'Rechazado' },
    settled: { bg: '#E2E3E5', color: '#383D41', label: 'Liquidado' },
  };
  return map[status] || { bg: '#eee', color: '#444', label: status };
};

export default function PettyCashAdminScreen({ navigation, route }: any) {
  const token = route?.params?.token;
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

  const insets = useSafeAreaInsets();
  const modalTopInset = Platform.OS === 'ios' ? Math.max(insets.top, 50) : insets.top;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'approvals' | 'drivers' | 'blocks'>('approvals');
  const [allBlocks, setAllBlocks] = useState<any[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [expandedBlockId, setExpandedBlockId] = useState<number | null>(null);

  const [branchWallet, setBranchWallet] = useState<Wallet | null>(null);
  const [driverWallets, setDriverWallets] = useState<Wallet[]>([]);
  const [pending, setPending] = useState<Movement[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  // Modal: anticipo
  const [advOpen, setAdvOpen] = useState(false);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [advDriver, setAdvDriver] = useState<DriverOption | null>(null);
  const [advAmount, setAdvAmount] = useState('');
  const [advPurpose, setAdvPurpose] = useState('');
  const [advBusy, setAdvBusy] = useState(false);

  // Modal: revisar gasto
  const [reviewMov, setReviewMov] = useState<Movement | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [photoViewerUrl, setPhotoViewerUrl] = useState<string | null>(null);

  // Modal: registrar gasto de sucursal (igual que la app del chofer)
  const [gastoOpen, setGastoOpen] = useState(false);
  const [gastoBlockId, setGastoBlockId] = useState<number | null>(null);
  const [gastoCategory, setGastoCategory] = useState<string>('combustible');
  const [gastoAmount, setGastoAmount] = useState('');
  const [gastoConcept, setGastoConcept] = useState('');
  const [gastoPhoto, setGastoPhoto] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [gastoBusy, setGastoBusy] = useState(false);
  const gastoAmountRef = useRef<TextInput>(null);
  const gastoConceptRef = useRef<TextInput>(null);

  // Modal: cerrar ruta / devolución de sobrante
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleDriver, setSettleDriver] = useState<Wallet | null>(null);
  const [settleCash, setSettleCash] = useState('');
  const [settleNotes, setSettleNotes] = useState('');
  const [settleBusy, setSettleBusy] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [s, bw, dw, pe] = await Promise.all([
        api.get('/api/admin/petty-cash/stats', { headers: authHeaders }),
        api.get('/api/admin/petty-cash/wallets?owner_type=branch', { headers: authHeaders }),
        api.get('/api/admin/petty-cash/wallets?owner_type=driver', { headers: authHeaders }),
        api.get('/api/admin/petty-cash/pending', { headers: authHeaders }),
      ]);
      setStats(s.data || null);
      const branch = (bw.data?.wallets || [])[0] || null;
      setBranchWallet(branch);
      setDriverWallets(dw.data?.wallets || []);
      setPending(pe.data?.movements || []);

      if (branch?.id) {
        try {
          const det = await api.get(`/api/admin/petty-cash/wallets/${branch.id}`, { headers: authHeaders });
          setMovements(det.data?.movements || []);
        } catch {
          setMovements([]);
        }
      }
    } catch (err: any) {
      console.error('PettyCashAdmin loadData error', err);
      Alert.alert('Error', err?.response?.data?.error || 'No se pudo cargar la caja chica');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Cargar bloques al seleccionar la pestaña
  const loadBlocks = useCallback(async () => {
    setBlocksLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/petty-cash/route-blocks`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setAllBlocks(d.blocks || []);
    } catch { /* silencioso */ } finally { setBlocksLoading(false); }
  }, [token]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { if (tab === 'blocks') loadBlocks(); }, [tab]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // ---- Anticipo ----
  const openAdvance = async () => {
    setAdvDriver(null);
    setAdvAmount('');
    setAdvPurpose('');
    setAdvOpen(true);
    try {
      const r = await api.get('/api/admin/petty-cash/drivers', { headers: authHeaders });
      setDrivers(r.data?.drivers || []);
    } catch (err: any) {
      Alert.alert('Error', 'No se pudieron cargar los choferes');
    }
  };

  const submitAdvance = async () => {
    const amount = parseMontoEs(advAmount);
    if (!advDriver) {
      Alert.alert('Falta chofer', 'Selecciona el chofer destinatario');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Monto inválido', 'Captura un monto mayor a $0');
      return;
    }
    setAdvBusy(true);
    try {
      const r = await api.post(
        '/api/admin/petty-cash/advance-driver',
        {
          driver_user_id: advDriver.id,
          amount_mxn: amount,
          route_purpose: advPurpose || undefined,
        },
        { headers: authHeaders }
      );
      Alert.alert('✅ Vale creado', r.data?.message || 'El chofer debe aceptar y firmar el anticipo.');
      setAdvOpen(false);
      loadData();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'No se pudo crear el anticipo');
    } finally {
      setAdvBusy(false);
    }
  };

  // ---- Cerrar ruta / devolución de sobrante ----
  const submitSettle = async () => {
    if (!settleDriver) return;
    const cash = parseMontoEs(settleCash);
    if (!Number.isFinite(cash) || cash < 0) {
      Alert.alert('Monto inválido', 'Captura un monto válido (puede ser 0)');
      return;
    }
    setSettleBusy(true);
    try {
      await api.post(
        '/api/admin/petty-cash/route-settle',
        {
          driver_user_id: settleDriver.owner_id,
          cash_returned_mxn: cash,
          notes: settleNotes || undefined,
        },
        { headers: authHeaders }
      );
      Alert.alert('✅ Ruta cerrada', 'Devolución registrada y wallet del chofer reiniciada.');
      setSettleOpen(false);
      loadData();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'No se pudo cerrar la ruta');
    } finally {
      setSettleBusy(false);
    }
  };

  // ---- Registrar gasto (sale de la wallet de la sucursal) ----
  const openGasto = () => {
    setGastoCategory('combustible');
    setGastoAmount('');
    setGastoConcept('');
    setGastoPhoto(null);
    setGastoOpen(true);
  };

  const pickGastoPhoto = async (fromCamera: boolean) => {
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
      setGastoPhoto({
        uri: a.uri,
        name: a.fileName || `ticket-${Date.now()}.jpg`,
        type: a.mimeType || 'image/jpeg',
      });
    } catch {
      Alert.alert('Error', 'No se pudo obtener la foto');
    }
  };

  const submitGasto = async () => {
    const amount = parseMontoEs(gastoAmount, gastoCategory === 'impuestos_dhl');
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Monto inválido', 'Captura un monto mayor a $0');
      return;
    }
    if (!gastoPhoto) {
      Alert.alert('Foto requerida', 'Toma una foto del ticket o factura');
      return;
    }
    if (gastoCategory === 'impuestos_dhl' && !gastoConcept.trim()) {
      Alert.alert('Guía DHL requerida', 'Captura el número de guía DHL');
      return;
    }
    setGastoBusy(true);
    try {
      const form = new FormData();
      form.append('category', gastoCategory);
      form.append('amount_mxn', String(amount));
      if (gastoConcept) form.append('concept', gastoConcept);
      if (gastoBlockId) form.append('route_block_id', String(gastoBlockId));
      // @ts-ignore: RN FormData file
      form.append('evidence', {
        uri: gastoPhoto.uri,
        name: gastoPhoto.name,
        type: gastoPhoto.type,
      });

      const res = await fetch(`${API_URL}/api/petty-cash/branch-expenses`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: form as any,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'No se pudo registrar el gasto');
      }
      Alert.alert('✅ Gasto registrado', gastoBlockId ? `Gasto asignado al Bloque #${gastoBlockId}` : 'El gasto fue registrado.');
      setGastoOpen(false);
      setGastoBlockId(null);
      loadData();
      if (gastoBlockId) loadBlocks();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'No se pudo registrar el gasto');
    } finally {
      setGastoBusy(false);
    }
  };

  // ---- Aprobar / Rechazar ----
  const approveExpense = async () => {
    if (!reviewMov) return;
    setReviewBusy(true);
    try {
      await api.post(`/api/admin/petty-cash/movements/${reviewMov.id}/approve`, {}, { headers: authHeaders });
      Alert.alert('✅ Gasto aprobado', '');
      setReviewMov(null);
      loadData();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'No se pudo aprobar');
    } finally {
      setReviewBusy(false);
    }
  };

  const rejectExpense = async () => {
    if (!reviewMov) return;
    if (rejectReason.trim().length < 3) {
      Alert.alert('Motivo requerido', 'Captura el motivo del rechazo');
      return;
    }
    setReviewBusy(true);
    try {
      await api.post(
        `/api/admin/petty-cash/movements/${reviewMov.id}/reject`,
        { reason: rejectReason.trim() },
        { headers: authHeaders }
      );
      Alert.alert('Gasto rechazado', '');
      setReviewMov(null);
      setRejectReason('');
      loadData();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'No se pudo rechazar');
    } finally {
      setReviewBusy(false);
    }
  };

  const handleDeleteMovement = () => {
    if (!reviewMov) return;
    Alert.alert(
      'Eliminar movimiento',
      `¿Seguro que deseas eliminar este gasto de $${Number(reviewMov.amount_mxn).toFixed(2)}? El saldo del wallet se revertirá si ya estaba aprobado.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setReviewBusy(true);
            try {
              await api.delete(`/api/admin/petty-cash/movements/${reviewMov.id}`, { headers: authHeaders });
              Alert.alert('✅ Eliminado', 'El movimiento fue eliminado y el saldo revertido.');
              setReviewMov(null);
              loadData();
            } catch (err: any) {
              Alert.alert('Error', err?.response?.data?.error || 'No se pudo eliminar');
            } finally {
              setReviewBusy(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={ORANGE} />
          <Text style={styles.loadingText}>Cargando caja chica...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={28} color="#333" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Control de Gastos</Text>
          {branchWallet?.owner_name ? (
            <Text style={styles.headerSubtitle}>{branchWallet.owner_name}</Text>
          ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ORANGE]} />}
      >
        {/* Saldo de la sucursal */}
        {branchWallet && (
          <View style={styles.balanceCard}>
            <View style={styles.balanceRow}>
              <MaterialIcons name="account-balance" size={20} color="rgba(255,255,255,0.9)" />
              <Text style={styles.balanceBranch}>{branchWallet?.owner_name || 'Sin sucursal asignada'}</Text>
            </View>
            <Text style={styles.balanceLabel}>Saldo disponible</Text>
            <Text style={styles.balanceAmount}>{fmtMoney(branchWallet?.balance_mxn)}</Text>
            {branchWallet ? (
              <Text style={styles.balanceStatus}>
                {branchWallet.status === 'active' ? '🟢 Sucursal activa' : `⚠️ ${branchWallet.status}`}
              </Text>
            ) : null}
          </View>
        )}

        {/* Mini-stats */}
        {stats && (
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Total gastado</Text>
              <Text style={[styles.statValue, { color: '#1A1A1A' }]}>
                {fmtMoney(branchWallet?.total_spent_mxn ?? stats.total_spent_mxn)}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Por comprobar</Text>
              <Text style={[styles.statValue, { color: '#E68A00' }]}>
                {fmtMoney(stats.drivers_pending_to_verify)}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Pendientes aprobar</Text>
              <Text style={[styles.statValue, { color: '#E53935' }]}>
                {stats.pending_approvals_count} · {fmtMoney(stats.pending_approvals_total)}
              </Text>
            </View>
          </View>
        )}

        {/* Anticipo */}
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: ORANGE }, !branchWallet && { opacity: 0.5 }]}
          onPress={openAdvance}
          disabled={!branchWallet}
          activeOpacity={0.85}
        >
          <MaterialIcons name="send" size={20} color="#fff" />
          <Text style={styles.actionBtnText}>Anticipo a Chofer</Text>
        </TouchableOpacity>

        {/* Registrar gasto de sucursal (mismo flujo que la app del chofer) */}
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: GREEN, marginTop: 10 }, !branchWallet && { opacity: 0.5 }]}
          onPress={openGasto}
          disabled={!branchWallet}
          activeOpacity={0.85}
        >
          <MaterialIcons name="receipt-long" size={20} color="#fff" />
          <Text style={styles.actionBtnText}>Registrar Gasto (Sucursal)</Text>
        </TouchableOpacity>

        {/* Tabs */}
        <View style={styles.tabBar}>
          {([
            ['approvals', `Aprobaciones (${pending.length})`],
            ['drivers', `Choferes (${driverWallets.length})`],
            ['blocks', 'Bloques'],
          ] as const).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[styles.tab, tab === key && styles.tabActive]}
              onPress={() => setTab(key)}
            >
              <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* TAB: Aprobaciones */}
        {tab === 'approvals' && (
          <View style={styles.section}>
            {pending.length === 0 ? (
              <View style={styles.emptyBox}>
                <MaterialIcons name="check-circle" size={32} color="#bbb" />
                <Text style={styles.emptyText}>Sin gastos pendientes</Text>
              </View>
            ) : (
              pending.map((m) => {
                const cat = CATEGORIES[m.category || 'otros'] || { label: m.category || 'Otros', icon: '📝' };
                return (
                  <TouchableOpacity key={m.id} style={styles.card} onPress={() => { setReviewMov(m); setRejectReason(''); }}>
                    <View style={styles.movIcon}>
                      <Text style={{ fontSize: 22 }}>{cat.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{cat.label}</Text>
                      <Text style={styles.cardSub} numberOfLines={1}>
                        {m.driver_name || 'Chofer'} · {fmtDate(m.created_at)}
                      </Text>
                      {m.concept ? (
                        <Text style={styles.cardConcept} numberOfLines={1}>{m.concept}</Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.cardAmount, { color: '#E53935' }]}>{fmtMoney(m.amount_mxn)}</Text>
                      <View style={styles.reviewHint}>
                        <Text style={styles.reviewHintText}>Revisar</Text>
                        <MaterialIcons name="chevron-right" size={16} color={ORANGE} />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {/* TAB: Choferes */}
        {tab === 'drivers' && (
          <View style={styles.section}>
            {driverWallets.length === 0 ? (
              <View style={styles.emptyBox}>
                <MaterialIcons name="people-outline" size={32} color="#bbb" />
                <Text style={styles.emptyText}>Sin choferes con wallet</Text>
              </View>
            ) : (
              driverWallets.map((w) => (
                <View key={w.id} style={styles.card}>
                  <View style={[styles.movIcon, { backgroundColor: '#E3F2FD' }]}>
                    <MaterialIcons name="local-shipping" size={22} color="#1976D2" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{w.owner_name}</Text>
                    <Text style={styles.cardSub}>{w.owner_phone || 'Sin teléfono'}</Text>
                    <View style={styles.driverMetaRow}>
                      <Text style={styles.driverMeta}>Saldo: {fmtMoney(w.balance_mxn)}</Text>
                      {Number(w.pending_to_verify_mxn) > 0 && (
                        <Text style={[styles.driverMeta, { color: '#E68A00' }]}>
                          Por comprobar: {fmtMoney(w.pending_to_verify_mxn)}
                        </Text>
                      )}
                    </View>
                    {(Number(w.balance_mxn) > 0 || Number(w.pending_to_verify_mxn) > 0) && (
                      <TouchableOpacity
                        style={styles.settleBtn}
                        onPress={() => {
                          setSettleDriver(w);
                          setSettleCash('');
                          setSettleNotes('');
                          setSettleOpen(true);
                        }}
                      >
                        <MaterialIcons name="assignment-turned-in" size={16} color="#fff" />
                        <Text style={styles.settleBtnText}>Cerrar ruta / Devolución</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {Number(w.pending_expenses_count) > 0 && (
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText}>{w.pending_expenses_count}</Text>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* TAB: Movimientos */}
        {tab === 'movements' && (
          <View style={styles.section}>
            {movements.length === 0 ? (
              <View style={styles.emptyBox}>
                <MaterialIcons name="inbox" size={32} color="#bbb" />
                <Text style={styles.emptyText}>Sin movimientos registrados</Text>
              </View>
            ) : (
              movements.map((m) => {
                const isExpense = m.movement_type === 'expense';
                const isInflow = INFLOW_TYPES.includes(m.movement_type);
                const cat = isExpense ? CATEGORIES[m.category || 'otros'] : null;
                // El anticipo refleja la firma del chofer: si no ha firmado, queda Pendiente
                let effStatus = m.status;
                if (m.movement_type === 'advance' && m.advance_status) {
                  effStatus =
                    m.advance_status === 'pending_acceptance' ? 'pending'
                    : m.advance_status === 'accepted' ? 'approved'
                    : m.advance_status === 'settled' ? 'settled'
                    : m.status;
                }
                const st = statusMeta(effStatus);
                const title = isExpense
                  ? (cat?.label || m.category || 'Gasto')
                  : (MOVEMENT_LABELS[m.movement_type] || m.movement_type);
                const subtitle = isExpense ? (m.driver_name || m.concept) : m.concept;
                const confirmDelete = () => {
                  Alert.alert(
                    'Eliminar movimiento',
                    `¿Eliminar "${title}" por ${fmtMoney(m.amount_mxn)}?${m.status === 'approved' ? '\nEl saldo del wallet se revertirá.' : ''}`,
                    [
                      { text: 'Cancelar', style: 'cancel' },
                      {
                        text: 'Eliminar',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            await api.delete(`/api/admin/petty-cash/movements/${m.id}`, { headers: authHeaders });
                            loadData();
                          } catch (err: any) {
                            const status = err?.response?.status;
                            const data = err?.response?.data;
                            const msg = data?.error || data?.details || err?.message || 'No se pudo eliminar';
                            Alert.alert('Error', status ? `${status}: ${msg}` : msg);
                          }
                        },
                      },
                    ]
                  );
                };
                return (
                  <View key={m.id} style={styles.card}>
                    <View style={styles.movIcon}>
                      <Text style={{ fontSize: 22 }}>
                        {isExpense ? (cat?.icon || '🧾') : isInflow ? '💵' : '📤'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{title}</Text>
                      {subtitle ? (
                        <Text style={styles.cardConcept} numberOfLines={1}>{subtitle}</Text>
                      ) : null}
                      <Text style={styles.cardSub}>{fmtDate(m.created_at)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={[styles.cardAmount, { color: isInflow ? GREEN : '#E53935' }]}>
                        {isInflow ? '+' : '-'}{fmtMoney(m.amount_mxn)}
                      </Text>
                      <View style={[styles.chip, { backgroundColor: st.bg }]}>
                        <Text style={[styles.chipText, { color: st.color }]}>{st.label}</Text>
                      </View>
                      <TouchableOpacity onPress={confirmDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <MaterialIcons name="delete-outline" size={20} color="#B0BEC5" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* TAB: Bloques de Ruta */}
        {tab === 'blocks' && (
          <View style={styles.section}>
            {blocksLoading ? (
              <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 32 }} />
            ) : allBlocks.length === 0 ? (
              <View style={styles.emptyBox}>
                <MaterialIcons name="local-shipping" size={32} color="#bbb" />
                <Text style={styles.emptyText}>Sin bloques de ruta registrados</Text>
              </View>
            ) : allBlocks.map(b => {
              const containers: any[] = Array.isArray(b.containers) ? b.containers : [];
              const isExpanded = expandedBlockId === b.id;
              const isOpen = b.status !== 'finalized';
              return (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.clientCard, { borderLeftWidth: 4, borderLeftColor: isOpen ? '#FF9800' : GREEN, marginBottom: 10 }]}
                  onPress={() => setExpandedBlockId(isExpanded ? null : b.id)}
                  activeOpacity={0.85}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '700', fontSize: 15, color: '#111' }}>Bloque #{b.id}</Text>
                      <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }}>{b.monitorista_name || '—'}</Text>
                      <Text style={{ fontSize: 12, color: '#999', marginTop: 1 }}>
                        {new Date(b.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <View style={[styles.chip, { backgroundColor: isOpen ? '#FFF3E0' : '#E8F5E9' }]}>
                        <Text style={[styles.chipText, { color: isOpen ? '#E65100' : '#2E7D32' }]}>{isOpen ? 'Abierto' : 'Finalizado'}</Text>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#E53935' }}>
                        ${parseFloat(b.total_expenses || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </Text>
                      <MaterialIcons name={isExpanded ? 'expand-less' : 'expand-more'} size={20} color="#999" />
                    </View>
                  </View>

                  {isExpanded && (
                    <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0' }}>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                        <View style={{ flex: 1, minWidth: 140 }}>
                          <Text style={styles.detailLabel}>Gastos registrados</Text>
                          <Text style={styles.detailValue}>{b.expense_count}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 140 }}>
                          <Text style={styles.detailLabel}>Pendientes aprobar</Text>
                          <Text style={[styles.detailValue, b.pending_expense_count > 0 && { color: '#E53935' }]}>{b.pending_expense_count}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 140 }}>
                          <Text style={styles.detailLabel}>Total asignado</Text>
                          <Text style={[styles.detailValue, { color: GREEN }]}>${parseFloat(b.total_allocated_mxn || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Text>
                        </View>
                        {b.finalized_at && (
                          <View style={{ flex: 1, minWidth: 140 }}>
                            <Text style={styles.detailLabel}>Cierre</Text>
                            <Text style={styles.detailValue}>{new Date(b.finalized_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
                          </View>
                        )}
                      </View>
                      {containers.length > 0 && (
                        <>
                          <Text style={styles.detailLabel}>Contenedores</Text>
                          <Text style={{ fontSize: 13, color: '#333', marginTop: 2 }}>{containers.map((c: any) => c.container_number).join(' · ')}</Text>
                        </>
                      )}
                      {b.notes ? (
                        <View style={{ marginTop: 8, padding: 8, backgroundColor: '#f9f9f9', borderRadius: 6 }}>
                          <Text style={styles.detailLabel}>Notas</Text>
                          <Text style={{ fontSize: 13, color: '#555' }}>{b.notes}</Text>
                        </View>
                      ) : null}
                      {isOpen && (
                        <TouchableOpacity
                          style={{ marginTop: 12, backgroundColor: ORANGE, borderRadius: 8, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                          onPress={() => { setGastoBlockId(b.id); setGastoOpen(true); }}
                        >
                          <MaterialIcons name="add-circle-outline" size={18} color="#fff" />
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Agregar gasto al bloque</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Modal: Anticipo */}
      <Modal visible={advOpen} animationType="slide" onRequestClose={() => !advBusy && setAdvOpen(false)}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.header, { paddingTop: modalTopInset + 12 }]}>
            <TouchableOpacity onPress={() => setAdvOpen(false)} disabled={advBusy}>
              <MaterialIcons name="close" size={28} color="#333" />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { marginLeft: 12 }]}>Anticipo a Chofer</Text>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                El anticipo sale del saldo de la sucursal. El chofer debe "Aceptar y Firmar" desde su app
                antes de poder usarlo.
              </Text>
            </View>

            <Text style={styles.label}>Chofer</Text>
            {drivers.length === 0 ? (
              <Text style={styles.helperText}>No hay choferes disponibles en tu sucursal.</Text>
            ) : (
              drivers.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={[styles.driverPick, advDriver?.id === d.id && styles.driverPickActive]}
                  onPress={() => setAdvDriver(d)}
                >
                  <MaterialIcons
                    name={advDriver?.id === d.id ? 'radio-button-checked' : 'radio-button-unchecked'}
                    size={20}
                    color={advDriver?.id === d.id ? ORANGE : '#aaa'}
                  />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={styles.driverPickName}>{d.full_name}</Text>
                    <Text style={styles.driverPickMeta}>
                      {d.role}{d.phone ? ` · ${d.phone}` : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}

            <Text style={styles.label}>Monto ({branchWallet?.currency || 'MXN'})</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              placeholder="0.00"
              value={advAmount}
              onChangeText={setAdvAmount}
            />
            {advAmount ? (
              <Text style={{ marginTop: -8, marginBottom: 8, fontSize: 12, color: '#666' }}>
                Se registrará como: <Text style={{ fontWeight: '700', color: '#1A1A1A' }}>{fmtMoney(parseMontoEs(advAmount))}</Text>
              </Text>
            ) : null}

            <Text style={styles.label}>Motivo / Ruta (opcional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej. Ruta MTY-LRD"
              value={advPurpose}
              onChangeText={setAdvPurpose}
            />

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: ORANGE, marginTop: 22 }, advBusy && { opacity: 0.6 }]}
              onPress={submitAdvance}
              disabled={advBusy}
            >
              {advBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="send" size={20} color="#fff" />
                  <Text style={styles.actionBtnText}>Crear Vale</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal: Registrar gasto de sucursal */}
      <Modal visible={gastoOpen} animationType="slide" onRequestClose={() => { if (!gastoBusy) { setGastoOpen(false); setGastoBlockId(null); } }}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.header, { paddingTop: modalTopInset + 12 }]}>
            <TouchableOpacity onPress={() => { setGastoOpen(false); setGastoBlockId(null); }} disabled={gastoBusy}>
              <MaterialIcons name="close" size={28} color="#333" />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { marginLeft: 12 }]}>{gastoBlockId ? `Gasto → Bloque #${gastoBlockId}` : 'Registrar Gasto'}</Text>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                Este gasto se deduce de la wallet de <Text style={{ fontWeight: '700' }}>{branchWallet?.owner_name || 'la sucursal'}</Text> y se registra como aprobado automáticamente. Se requiere foto del ticket.
              </Text>
            </View>

            <Text style={styles.label}>Categoría</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 }}>
              {Object.entries(CATEGORIES).map(([key, c]) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => {
                    setGastoCategory(key);
                    if (key === 'impuestos_dhl') {
                      setTimeout(() => gastoAmountRef.current?.focus(), 100);
                    }
                  }}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    backgroundColor: gastoCategory === key ? ORANGE : '#F0F0F0',
                    borderRadius: 20,
                    margin: 4,
                  }}
                >
                  <Text style={{ color: gastoCategory === key ? '#fff' : '#333', fontWeight: '600' }}>
                    {c.icon} {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Monto ({branchWallet?.currency || 'MXN'})</Text>
            <TextInput
              ref={gastoAmountRef}
              style={styles.input}
              keyboardType="decimal-pad"
              placeholder="0.00"
              value={gastoAmount}
              onChangeText={setGastoAmount}
              returnKeyType={gastoCategory === 'impuestos_dhl' ? 'next' : 'done'}
              onSubmitEditing={() => {
                if (gastoCategory === 'impuestos_dhl') {
                  gastoConceptRef.current?.focus();
                }
              }}
            />
            {gastoAmount ? (
              <Text style={{ marginTop: -8, marginBottom: 8, fontSize: 12, color: '#666' }}>
                Se registrará como: <Text style={{ fontWeight: '700', color: '#1A1A1A' }}>{fmtMoney(parseMontoEs(gastoAmount, gastoCategory === 'impuestos_dhl'))}</Text>
              </Text>
            ) : null}

            <Text style={styles.label}>
              {gastoCategory === 'impuestos_dhl' ? 'Guía DHL (requerida)' : 'Concepto / descripción (opcional)'}
            </Text>
            <TextInput
              ref={gastoConceptRef}
              style={gastoCategory === 'impuestos_dhl' ? styles.input : [styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
              placeholder={gastoCategory === 'impuestos_dhl' ? 'Ej. 1234567890' : 'Ej. Tóner impresora, factura A1234'}
              value={gastoConcept}
              onChangeText={setGastoConcept}
              multiline={gastoCategory !== 'impuestos_dhl'}
              autoCapitalize="characters"
              returnKeyType={gastoCategory === 'impuestos_dhl' ? 'done' : 'default'}
              onSubmitEditing={() => {
                if (gastoCategory === 'impuestos_dhl' && gastoConcept.trim()) {
                  pickGastoPhoto(true);
                }
              }}
            />

            <Text style={styles.label}>Foto del ticket (requerida)</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: ORANGE, flex: 1 }]}
                onPress={() => pickGastoPhoto(true)}
                disabled={gastoBusy}
              >
                <MaterialIcons name="photo-camera" size={20} color="#fff" />
                <Text style={styles.actionBtnText}>Cámara</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#555', flex: 1 }]}
                onPress={() => pickGastoPhoto(false)}
                disabled={gastoBusy}
              >
                <MaterialIcons name="photo-library" size={20} color="#fff" />
                <Text style={styles.actionBtnText}>Galería</Text>
              </TouchableOpacity>
            </View>

            {gastoPhoto ? (
              <Image
                source={{ uri: gastoPhoto.uri }}
                style={{ width: '100%', height: 260, marginTop: 12, borderRadius: 8, backgroundColor: '#eee' }}
                resizeMode="contain"
              />
            ) : null}

            <TouchableOpacity
              style={[
                styles.actionBtn,
                { backgroundColor: GREEN, marginTop: 22 },
                (gastoBusy || !gastoAmount || !gastoPhoto || (gastoCategory === 'impuestos_dhl' && !gastoConcept.trim())) && { opacity: 0.6 },
              ]}
              onPress={submitGasto}
              disabled={gastoBusy || !gastoAmount || !gastoPhoto || (gastoCategory === 'impuestos_dhl' && !gastoConcept.trim())}
            >
              {gastoBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="check" size={20} color="#fff" />
                  <Text style={styles.actionBtnText}>Registrar Gasto</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal: Revisar gasto */}
      <Modal
        visible={!!reviewMov}
        animationType="slide"
        onRequestClose={() => !reviewBusy && setReviewMov(null)}
      >
        <View style={styles.container}>
          <View style={[styles.header, { paddingTop: modalTopInset + 12 }]}>
            <TouchableOpacity onPress={() => setReviewMov(null)} disabled={reviewBusy}>
              <MaterialIcons name="close" size={28} color="#333" />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { marginLeft: 12 }]}>Revisión de gasto</Text>
          </View>
          {reviewMov && (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
              {reviewMov.evidence_url ? (
                <TouchableOpacity activeOpacity={0.9} onPress={() => setPhotoViewerUrl(reviewMov.evidence_url!)}>
                  <Image source={{ uri: reviewMov.evidence_url }} style={styles.ticketPhoto} />
                  <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ color: '#fff', fontSize: 12 }}>🔍 Toca para ampliar</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <View style={[styles.infoBox, { backgroundColor: '#FFF3CD' }]}>
                  <Text style={[styles.infoText, { color: '#856404' }]}>Sin foto del ticket</Text>
                </View>
              )}
              {reviewMov.odometer_photo_url ? (
                <>
                  <Text style={styles.label}>Odómetro</Text>
                  <TouchableOpacity activeOpacity={0.9} onPress={() => setPhotoViewerUrl(reviewMov.odometer_photo_url!)}>
                    <Image source={{ uri: reviewMov.odometer_photo_url }} style={styles.ticketPhoto} />
                    <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ color: '#fff', fontSize: 12 }}>🔍 Toca para ampliar</Text>
                    </View>
                  </TouchableOpacity>
                </>
              ) : null}

              <View style={styles.detailBox}>
                <DetailRow label="Chofer" value={reviewMov.driver_name || '—'} />
                <DetailRow label="Sucursal" value={reviewMov.branch_name || '—'} />
                <DetailRow label="Fecha" value={fmtDate(reviewMov.created_at)} />
                <DetailRow
                  label="Categoría"
                  value={(CATEGORIES[reviewMov.category || 'otros'] || { label: reviewMov.category }).label || '—'}
                />
                {reviewMov.concept ? <DetailRow label="Concepto" value={reviewMov.concept} /> : null}
                {reviewMov.odometer_km ? <DetailRow label="Km" value={String(reviewMov.odometer_km)} /> : null}
              </View>

              <Text style={styles.reviewAmount}>{fmtMoney(reviewMov.amount_mxn)}</Text>

              {reviewMov.gps_lat && reviewMov.gps_lng ? (
                <View style={[styles.infoBox, { backgroundColor: '#D4EDDA' }]}>
                  <Text style={[styles.infoText, { color: '#155724' }]}>
                    📍 GPS: {reviewMov.gps_lat}, {reviewMov.gps_lng}
                  </Text>
                </View>
              ) : (
                <View style={[styles.infoBox, { backgroundColor: '#FFF3CD' }]}>
                  <Text style={[styles.infoText, { color: '#856404' }]}>
                    🚩 Sin coordenadas GPS — posible discrepancia
                  </Text>
                </View>
              )}

              <Text style={styles.label}>Motivo de rechazo (si aplica)</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                placeholder="Captura el motivo solo si vas a rechazar"
                value={rejectReason}
                onChangeText={setRejectReason}
                multiline
              />

              <View style={styles.reviewActions}>
                <TouchableOpacity
                  style={[styles.reviewBtn, { backgroundColor: '#E53935' }, reviewBusy && { opacity: 0.6 }]}
                  onPress={rejectExpense}
                  disabled={reviewBusy}
                >
                  <MaterialIcons name="cancel" size={20} color="#fff" />
                  <Text style={styles.actionBtnText}>Rechazar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.reviewBtn, { backgroundColor: GREEN }, reviewBusy && { opacity: 0.6 }]}
                  onPress={approveExpense}
                  disabled={reviewBusy}
                >
                  {reviewBusy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <MaterialIcons name="check-circle" size={20} color="#fff" />
                      <Text style={styles.actionBtnText}>Aprobar</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#B0BEC5', marginTop: 10 }, reviewBusy && { opacity: 0.6 }]}
                onPress={handleDeleteMovement}
                disabled={reviewBusy}
              >
                <MaterialIcons name="delete-outline" size={20} color="#fff" />
                <Text style={styles.actionBtnText}>Eliminar movimiento</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Modal: Cerrar Ruta / Devolución de sobrante */}
      <Modal visible={settleOpen} animationType="slide" onRequestClose={() => !settleBusy && setSettleOpen(false)}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.header, { paddingTop: modalTopInset + 12 }]}>
            <TouchableOpacity onPress={() => setSettleOpen(false)} disabled={settleBusy}>
              <MaterialIcons name="close" size={28} color="#333" />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { marginLeft: 12 }]}>Cerrar Ruta / Devolución</Text>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            <View style={[styles.infoBox, { marginBottom: 16 }]}>
              <Text style={styles.infoText}>
                Liquida los vales aceptados del chofer, suma gastos aprobados, registra el efectivo
                devuelto a la sucursal y reinicia el saldo del chofer.
              </Text>
            </View>
            {settleDriver && (
              <View style={[styles.card, { marginBottom: 16 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{settleDriver.owner_name}</Text>
                  <Text style={styles.cardSub}>{settleDriver.branch_name || '—'}</Text>
                  <Text style={styles.driverMeta}>Saldo: {fmtMoney(settleDriver.balance_mxn)}</Text>
                  <Text style={styles.driverMeta}>Por comprobar: {fmtMoney(settleDriver.pending_to_verify_mxn)}</Text>
                </View>
              </View>
            )}
            <Text style={styles.inputLabel}>Efectivo devuelto (MXN)</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              keyboardType="decimal-pad"
              value={settleCash}
              onChangeText={setSettleCash}
              editable={!settleBusy}
            />
            <Text style={[styles.inputLabel, { marginTop: 12 }]}>Notas (opcional)</Text>
            <TextInput
              style={[styles.input, { height: 80 }]}
              placeholder="Observaciones del cierre…"
              multiline
              value={settleNotes}
              onChangeText={setSettleNotes}
              editable={!settleBusy}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, { marginTop: 20, backgroundColor: GREEN }]}
              onPress={submitSettle}
              disabled={settleBusy || settleCash === ''}
            >
              {settleBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="assignment-turned-in" size={20} color="#fff" />
                  <Text style={styles.primaryBtnText}>Cerrar ruta</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Visor de foto a pantalla completa */}
      <Modal visible={!!photoViewerUrl} transparent animationType="fade" onRequestClose={() => setPhotoViewerUrl(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity style={{ position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10 }} onPress={() => setPhotoViewerUrl(null)}>
            <MaterialIcons name="close" size={32} color="#fff" />
          </TouchableOpacity>
          {photoViewerUrl && (
            <Image
              source={{ uri: photoViewerUrl }}
              style={{ width: '100%', height: '85%' }}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

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
  headerSubtitle: { fontSize: 12, color: '#666' },

  balanceCard: {
    backgroundColor: GREEN,
    borderRadius: 16,
    padding: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  balanceBranch: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  balanceLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  balanceAmount: { color: '#fff', fontSize: 34, fontWeight: 'bold', marginTop: 4 },
  balanceStatus: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 8 },

  statsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
  },
  statLabel: { fontSize: 11, color: '#888' },
  statValue: { fontSize: 16, fontWeight: 'bold', marginTop: 4 },

  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 14,
  },
  actionBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ECECEC',
    borderRadius: 10,
    padding: 4,
    marginTop: 18,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: '#fff', elevation: 1 },
  tabText: { fontSize: 12, color: '#777', fontWeight: '600' },
  tabTextActive: { color: ORANGE },

  section: { marginTop: 14 },

  emptyBox: { alignItems: 'center', padding: 28, backgroundColor: '#fff', borderRadius: 12 },
  emptyText: { color: '#999', marginTop: 6 },

  card: {
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
  cardTitle: { fontSize: 14, fontWeight: 'bold', color: '#222' },
  cardSub: { fontSize: 11, color: '#999', marginTop: 3 },
  cardConcept: { fontSize: 12, color: '#666', marginTop: 2 },
  cardAmount: { fontSize: 15, fontWeight: 'bold' },
  reviewHint: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  reviewHintText: { fontSize: 11, color: ORANGE, fontWeight: 'bold' },

  driverMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  driverMeta: { fontSize: 11, color: '#555' },
  countBadge: {
    backgroundColor: '#E53935',
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countBadgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginTop: 4 },
  chipText: { fontSize: 10, fontWeight: 'bold' },

  infoBox: { backgroundColor: '#E3F2FD', borderRadius: 10, padding: 12, marginBottom: 6 },
  infoText: { fontSize: 12, color: '#1565C0' },

  label: { fontSize: 13, fontWeight: 'bold', color: '#444', marginTop: 16, marginBottom: 6 },
  helperText: { fontSize: 12, color: '#999' },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },

  driverPick: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  driverPickActive: { borderColor: ORANGE, backgroundColor: '#FFF6F2' },
  driverPickName: { fontSize: 14, fontWeight: 'bold', color: '#222' },
  driverPickMeta: { fontSize: 11, color: '#888', marginTop: 2 },

  ticketPhoto: {
    width: '100%',
    height: 240,
    borderRadius: 12,
    resizeMode: 'cover',
    marginBottom: 8,
    backgroundColor: '#e0e0e0',
  },

  detailBox: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 10 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  detailLabel: { fontSize: 13, color: '#888' },
  detailValue: { fontSize: 13, color: '#222', fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12 },

  reviewAmount: { fontSize: 30, fontWeight: 'bold', color: '#222', marginTop: 14, textAlign: 'center' },

  reviewActions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  reviewBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
  },

  inputLabel: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 6 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: ORANGE,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  settleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: GREEN,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  settleBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
