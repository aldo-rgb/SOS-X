import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  StyleSheet, RefreshControl, Alert, Modal, ScrollView, Image,
  StatusBar, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const GREEN = '#16a34a';
const RED = '#dc2626';
const YELLOW = '#d97706';

type Props = NativeStackScreenProps<RootStackParamList, 'VerificacionesAdmin'>;

interface VerifItem {
  id: number;
  full_name: string;
  email: string;
  box_id: string;
  phone?: string;
  role?: string;
  verification_status: string;
  verification_submitted_at?: string;
  ai_verification_reason?: string;
  has_ine_front: boolean;
  has_ine_back: boolean;
  has_selfie: boolean;
  has_signature: boolean;
  avatar_url?: string | null;
}

interface Stats {
  pending: number;
  verified: number;
  rejected: number;
  not_started: number;
}

interface DetailData extends VerifItem {
  ine_front_url?: string;
  ine_back_url?: string;
  selfie_url?: string;
  signature_url?: string;
  is_verified?: boolean;
}

export default function VerificacionesAdminScreen({ route, navigation }: Props) {
  const { token } = route.params as any;
  const [items, setItems] = useState<VerifItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [acting, setActing] = useState(false);

  // Tabs: identidad | descuento | saldo
  const [tab, setTab] = useState<'identidad' | 'descuento' | 'saldo'>('identidad');
  const [descItems, setDescItems] = useState<any[]>([]);
  const [descStats, setDescStats] = useState<any | null>(null);
  const [saldoItems, setSaldoItems] = useState<any[]>([]);
  const [saldoStats, setSaldoStats] = useState<any | null>(null);
  const [csLoading, setCsLoading] = useState(false);
  const [csRefreshing, setCsRefreshing] = useState(false);

  // Modal de PIN (aprobar/rechazar descuento o saldo — requiere PIN de director)
  const [pinCtx, setPinCtx] = useState<{ kind: 'descuento' | 'saldo'; id: number; accion: 'aprobar' | 'rechazar'; title: string } | null>(null);
  const [pin, setPin] = useState('');
  const [pinReason, setPinReason] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    try {
      const [listRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/verifications/pending`, { headers }),
        fetch(`${API_URL}/api/admin/verifications/stats`, { headers }),
      ]);
      if (listRes.ok) setItems(await listRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (e) {
      console.warn('Error cargando verificaciones:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (userId: number) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/verifications/${userId}/details`, { headers });
      if (res.ok) setDetail(await res.json());
    } catch (e) { /* ignore */ }
    setDetailLoading(false);
  };

  const handleAction = async (action: 'approve' | 'reject') => {
    if (!detail) return;
    if (action === 'reject') {
      Alert.prompt(
        'Motivo de rechazo',
        'Escribe el motivo para informar al usuario:',
        async (reason) => {
          if (!reason?.trim()) return;
          await doAction(action, reason);
        },
        'plain-text',
      );
    } else {
      Alert.alert(
        'Aprobar verificación',
        `¿Confirmas que los documentos de ${detail.full_name} son válidos?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Aprobar', style: 'default', onPress: () => doAction(action) },
        ],
      );
    }
  };

  const doAction = async (action: 'approve' | 'reject', reason?: string) => {
    if (!detail) return;
    setActing(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/verifications/${detail.id}/${action}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(reason ? { reason } : {}),
      });
      if (res.ok) {
        Alert.alert('Listo', action === 'approve' ? '✅ Verificación aprobada' : '❌ Verificación rechazada');
        setDetail(null);
        load();
      } else {
        const err = await res.json();
        Alert.alert('Error', err.error || 'No se pudo completar la acción');
      }
    } catch (e) {
      Alert.alert('Error de red', String(e));
    }
    setActing(false);
  };

  const loadDiscounts = useCallback(async () => {
    setCsLoading(true);
    try {
      const [l, s] = await Promise.all([
        fetch(`${API_URL}/api/cs/descuentos/pendientes?estado=pendiente`, { headers }),
        fetch(`${API_URL}/api/cs/descuentos/stats`, { headers }),
      ]);
      if (l.ok) { const d = await l.json(); setDescItems(Array.isArray(d) ? d : (d.descuentos || [])); }
      if (s.ok) setDescStats(await s.json());
    } catch (e) { console.warn('Error cargando descuentos:', e); }
    setCsLoading(false); setCsRefreshing(false);
  }, [token]);

  const loadSaldos = useCallback(async () => {
    setCsLoading(true);
    try {
      const [l, s] = await Promise.all([
        fetch(`${API_URL}/api/cs/saldo-a-favor/pendientes?estado=pendiente`, { headers }),
        fetch(`${API_URL}/api/cs/saldo-a-favor/stats`, { headers }),
      ]);
      if (l.ok) { const d = await l.json(); setSaldoItems(Array.isArray(d) ? d : (d.saldos || [])); }
      if (s.ok) setSaldoStats(await s.json());
    } catch (e) { console.warn('Error cargando saldo a favor:', e); }
    setCsLoading(false); setCsRefreshing(false);
  }, [token]);

  // Cargar contadores de descuentos/saldo al entrar (para los badges de las pestañas)
  useEffect(() => { loadDiscounts(); loadSaldos(); }, [loadDiscounts, loadSaldos]);

  const openPin = (kind: 'descuento' | 'saldo', id: number, accion: 'aprobar' | 'rechazar', title: string) => {
    setPin(''); setPinReason(''); setPinError('');
    setPinCtx({ kind, id, accion, title });
  };

  const submitPin = async () => {
    if (!pinCtx || !pin.trim()) { setPinError('Ingresa el PIN'); return; }
    if (pinCtx.accion === 'rechazar' && !pinReason.trim()) { setPinError('Escribe el motivo de rechazo'); return; }
    setPinSubmitting(true); setPinError('');
    try {
      const base = pinCtx.kind === 'descuento' ? 'descuentos' : 'saldo-a-favor';
      const res = await fetch(`${API_URL}/api/cs/${base}/${pinCtx.id}/resolver`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: pinCtx.accion,
          pin: pin.trim(),
          motivo_rechazo: pinCtx.accion === 'rechazar' ? pinReason.trim() : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const kind = pinCtx.kind;
        setPinCtx(null); setPin(''); setPinReason('');
        Alert.alert('Listo', data.message || (pinCtx.accion === 'aprobar' ? '✅ Aprobado' : '❌ Rechazado'));
        if (kind === 'descuento') loadDiscounts(); else loadSaldos();
      } else {
        setPinError(data.error || 'PIN inválido');
      }
    } catch (e) {
      setPinError('Error de red');
    }
    setPinSubmitting(false);
  };

  const money = (n: any, cur?: string) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${cur || 'MXN'}`;

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const DocBadge = ({ label, ok }: { label: string; ok: boolean }) => (
    <View style={[styles.badge, { backgroundColor: ok ? '#dcfce7' : '#fee2e2' }]}>
      <Ionicons name={ok ? 'checkmark-circle' : 'close-circle'} size={12} color={ok ? GREEN : RED} />
      <Text style={[styles.badgeText, { color: ok ? GREEN : RED }]}>{label}</Text>
    </View>
  );

  const renderItem = ({ item }: { item: VerifItem }) => (
    <TouchableOpacity style={styles.card} onPress={() => openDetail(item.id)} activeOpacity={0.7}>
      <View style={styles.cardRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(item.full_name || '?')[0].toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{item.full_name}</Text>
          <Text style={styles.email} numberOfLines={1}>{item.email}</Text>
          <View style={styles.metaRow}>
            {item.box_id ? <Text style={styles.boxId}>📦 {item.box_id}</Text> : null}
            <Text style={styles.date}>{formatDate(item.verification_submitted_at)}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
      </View>
      {item.ai_verification_reason ? (
        <Text style={styles.aiReason} numberOfLines={2}>🤖 {item.ai_verification_reason}</Text>
      ) : null}
      <View style={styles.badgeRow}>
        <DocBadge label="INE Frente" ok={item.has_ine_front} />
        <DocBadge label="INE Reverso" ok={item.has_ine_back} />
        <DocBadge label="Selfie" ok={item.has_selfie} />
        <DocBadge label="Firma" ok={item.has_signature} />
      </View>
    </TouchableOpacity>
  );

  const renderTabButton = (key: 'identidad' | 'descuento' | 'saldo', label: string, icon: any, badge: number) => (
    <TouchableOpacity style={[styles.tabBtn, tab === key && styles.tabBtnActive]} onPress={() => setTab(key)} activeOpacity={0.7}>
      <View>
        <Ionicons name={icon} size={20} color={tab === key ? ORANGE : '#6b7280'} />
        {badge > 0 && <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{badge}</Text></View>}
      </View>
      <Text style={[styles.tabLabel, tab === key && { color: ORANGE, fontWeight: '700' }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );

  const renderDescItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <Text style={styles.name}>{item.guia_tracking}</Text>
      <Text style={styles.email}>{item.cliente_nombre || `ID: ${item.cliente_id}`}</Text>
      {item.concepto ? <Text style={styles.csConcepto}>{item.concepto}</Text> : null}
      <View style={styles.csRow}>
        <Text style={[styles.csMonto, { color: RED }]}>-{money(item.monto, item.moneda)}</Text>
        {item.solicitado_nombre ? <Text style={styles.csBy}>{item.solicitado_nombre}</Text> : null}
      </View>
      <View style={styles.csActions}>
        <TouchableOpacity style={[styles.csBtn, { backgroundColor: RED }]} onPress={() => openPin('descuento', item.id, 'rechazar', `Rechazar descuento ${item.guia_tracking}`)}>
          <Text style={styles.csBtnText}>Rechazar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.csBtn, { backgroundColor: GREEN }]} onPress={() => openPin('descuento', item.id, 'aprobar', `Aprobar descuento ${item.guia_tracking}`)}>
          <Text style={styles.csBtnText}>Aprobar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSaldoItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <Text style={styles.name}>{item.cliente_nombre || `ID: ${item.cliente_id}`}</Text>
      {(item.motivo || item.concepto) ? <Text style={styles.csConcepto}>{item.motivo || item.concepto}</Text> : null}
      <View style={styles.csRow}>
        <Text style={[styles.csMonto, { color: GREEN }]}>+{money(item.monto, item.moneda)}</Text>
        {item.solicitado_nombre ? <Text style={styles.csBy}>{item.solicitado_nombre}</Text> : null}
      </View>
      <View style={styles.csActions}>
        <TouchableOpacity style={[styles.csBtn, { backgroundColor: RED }]} onPress={() => openPin('saldo', item.id, 'rechazar', 'Rechazar saldo a favor')}>
          <Text style={styles.csBtnText}>Rechazar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.csBtn, { backgroundColor: GREEN }]} onPress={() => openPin('saldo', item.id, 'aprobar', 'Aprobar saldo a favor')}>
          <Text style={styles.csBtnText}>Aprobar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title}>Verificaciones KYC</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        {renderTabButton('identidad', 'Identidad', 'shield-checkmark-outline', stats?.pending || 0)}
        {renderTabButton('descuento', 'Descuentos', 'pricetag-outline', descStats?.pendientes || 0)}
        {renderTabButton('saldo', 'Saldo a Favor', 'wallet-outline', saldoStats?.pendientes || 0)}
      </View>

      {/* IDENTIDAD */}
      {tab === 'identidad' && (loading ? (
        <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 60 }} />
      ) : (
        <>
          {/* Stats */}
          {stats && (
            <View style={styles.statsRow}>
              <View style={[styles.stat, { borderColor: YELLOW }]}>
                <Text style={[styles.statNum, { color: YELLOW }]}>{stats.pending}</Text>
                <Text style={styles.statLabel}>Pendientes</Text>
              </View>
              <View style={[styles.stat, { borderColor: GREEN }]}>
                <Text style={[styles.statNum, { color: GREEN }]}>{stats.verified}</Text>
                <Text style={styles.statLabel}>Verificados</Text>
              </View>
              <View style={[styles.stat, { borderColor: RED }]}>
                <Text style={[styles.statNum, { color: RED }]}>{stats.rejected}</Text>
                <Text style={styles.statLabel}>Rechazados</Text>
              </View>
              <View style={[styles.stat, { borderColor: '#9ca3af' }]}>
                <Text style={[styles.statNum, { color: '#6b7280' }]}>{stats.not_started}</Text>
                <Text style={styles.statLabel}>Sin iniciar</Text>
              </View>
            </View>
          )}

          <FlatList
            data={items}
            keyExtractor={i => String(i.id)}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={ORANGE} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="checkmark-done-circle-outline" size={56} color={GREEN} />
                <Text style={styles.emptyText}>No hay verificaciones pendientes</Text>
              </View>
            }
          />
        </>
      ))}

      {/* DESCUENTOS */}
      {tab === 'descuento' && (csLoading && descItems.length === 0 ? (
        <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={descItems}
          keyExtractor={(i: any) => String(i.id)}
          renderItem={renderDescItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={csRefreshing} onRefresh={() => { setCsRefreshing(true); loadDiscounts(); }} tintColor={ORANGE} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="pricetags-outline" size={52} color="#9ca3af" />
              <Text style={styles.emptyText}>No hay descuentos pendientes</Text>
            </View>
          }
        />
      ))}

      {/* SALDO A FAVOR */}
      {tab === 'saldo' && (csLoading && saldoItems.length === 0 ? (
        <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={saldoItems}
          keyExtractor={(i: any) => String(i.id)}
          renderItem={renderSaldoItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={csRefreshing} onRefresh={() => { setCsRefreshing(true); loadSaldos(); }} tintColor={ORANGE} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="wallet-outline" size={52} color="#9ca3af" />
              <Text style={styles.emptyText}>No hay saldos a favor pendientes</Text>
            </View>
          }
        />
      ))}

      {/* Loading overlay para detalle */}
      {detailLoading && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={ORANGE} />
        </View>
      )}

      {/* Modal detalle */}
      <Modal visible={!!detail} animationType="slide" onRequestClose={() => setDetail(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          {detail && (
            <>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setDetail(null)}>
                  <Ionicons name="close" size={26} color="#111" />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Revisión de Identidad</Text>
                <View style={{ width: 26 }} />
              </View>

              <ScrollView contentContainerStyle={styles.modalBody}>
                {/* Info usuario */}
                <View style={styles.userInfo}>
                  <View style={[styles.avatar, { width: 56, height: 56, borderRadius: 28 }]}>
                    <Text style={[styles.avatarText, { fontSize: 22 }]}>{(detail.full_name || '?')[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.detailName}>{detail.full_name}</Text>
                    <Text style={styles.detailEmail}>{detail.email}</Text>
                    {detail.phone ? <Text style={styles.detailSub}>📞 {detail.phone}</Text> : null}
                    {detail.box_id ? <Text style={styles.detailSub}>📦 {detail.box_id}</Text> : null}
                    <Text style={styles.detailSub}>🗓 Enviado: {formatDate(detail.verification_submitted_at)}</Text>
                  </View>
                </View>

                {/* AI Reason */}
                {detail.ai_verification_reason ? (
                  <View style={styles.aiBox}>
                    <Text style={styles.aiBoxTitle}>🤖 Análisis de IA</Text>
                    <Text style={styles.aiBoxText}>{detail.ai_verification_reason}</Text>
                  </View>
                ) : null}

                {/* Documentos */}
                <Text style={styles.sectionTitle}>Documentos</Text>

                {[
                  { label: 'INE Frente', url: detail.ine_front_url },
                  { label: 'INE Reverso', url: detail.ine_back_url },
                  { label: 'Selfie', url: detail.selfie_url },
                  { label: 'Firma', url: detail.signature_url },
                ].map(({ label, url }) => (
                  <View key={label} style={styles.docBlock}>
                    <Text style={styles.docLabel}>{label}</Text>
                    {url && (url.startsWith('data:') || url.startsWith('http')) ? (
                      <Image
                        source={{ uri: url.startsWith('data:') ? url : url }}
                        style={styles.docImg}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={[styles.docImg, styles.docMissing]}>
                        <Ionicons name="image-outline" size={32} color="#d1d5db" />
                        <Text style={{ color: '#9ca3af', fontSize: 12, marginTop: 4 }}>Sin imagen</Text>
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>

              {/* Botones acción */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: RED }, acting && styles.disabled]}
                  onPress={() => handleAction('reject')}
                  disabled={acting}
                >
                  {acting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="close-circle" size={20} color="#fff" />}
                  <Text style={styles.actionBtnText}>Rechazar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: GREEN }, acting && styles.disabled]}
                  onPress={() => handleAction('approve')}
                  disabled={acting}
                >
                  {acting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark-circle" size={20} color="#fff" />}
                  <Text style={styles.actionBtnText}>Aprobar</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </SafeAreaView>
      </Modal>

      {/* Modal PIN (aprobar/rechazar descuento o saldo) */}
      <Modal visible={!!pinCtx} transparent animationType="fade" onRequestClose={() => setPinCtx(null)}>
        <View style={styles.pinOverlay}>
          <View style={styles.pinCard}>
            <Text style={styles.pinTitle}>{pinCtx?.title}</Text>
            <Text style={styles.pinSub}>Ingresa el PIN de autorización (director / super admin).</Text>
            <TextInput
              style={styles.pinInput}
              value={pin}
              onChangeText={(t) => { setPin(t); setPinError(''); }}
              placeholder="PIN"
              placeholderTextColor="#9ca3af"
              secureTextEntry
              keyboardType="number-pad"
              autoFocus
            />
            {pinCtx?.accion === 'rechazar' && (
              <TextInput
                style={[styles.pinInput, { height: 70, textAlignVertical: 'top' }]}
                value={pinReason}
                onChangeText={setPinReason}
                placeholder="Motivo de rechazo"
                placeholderTextColor="#9ca3af"
                multiline
              />
            )}
            {pinError ? <Text style={styles.pinError}>{pinError}</Text> : null}
            <View style={styles.pinActions}>
              <TouchableOpacity style={[styles.csBtn, { backgroundColor: '#e5e7eb' }]} onPress={() => setPinCtx(null)} disabled={pinSubmitting}>
                <Text style={[styles.csBtnText, { color: '#374151' }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.csBtn, { backgroundColor: pinCtx?.accion === 'aprobar' ? GREEN : RED }, pinSubmitting && styles.disabled]}
                onPress={submitPin}
                disabled={pinSubmitting}
              >
                {pinSubmitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.csBtnText}>{pinCtx?.accion === 'aprobar' ? 'Aprobar' : 'Rechazar'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  backBtn: { marginRight: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#111', flex: 1 },
  statsRow: { flexDirection: 'row', padding: 12, gap: 8 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 2, backgroundColor: '#fff' },
  statNum: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 10, color: '#6b7280', marginTop: 2, textAlign: 'center' },
  list: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 24 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  name: { fontSize: 15, fontWeight: '700', color: '#111' },
  email: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  metaRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  boxId: { fontSize: 11, color: ORANGE, fontWeight: '600' },
  date: { fontSize: 11, color: '#9ca3af' },
  aiReason: { fontSize: 11, color: '#6b7280', backgroundColor: '#f3f4f6', borderRadius: 6, padding: 6, marginBottom: 8 },
  badgeRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontSize: 10, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, color: '#6b7280', textAlign: 'center' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  // Modal
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
  modalBody: { padding: 16, paddingBottom: 32 },
  userInfo: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  detailName: { fontSize: 17, fontWeight: '700', color: '#111' },
  detailEmail: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  detailSub: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  aiBox: { backgroundColor: '#fef9c3', borderRadius: 10, padding: 12, marginBottom: 16 },
  aiBoxTitle: { fontSize: 13, fontWeight: '700', color: '#92400e', marginBottom: 4 },
  aiBoxText: { fontSize: 12, color: '#78350f', lineHeight: 18 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 10 },
  docBlock: { marginBottom: 16 },
  docLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  docImg: { width: '100%', height: 200, borderRadius: 10, backgroundColor: '#f3f4f6' },
  docMissing: { alignItems: 'center', justifyContent: 'center' },
  actionRow: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  // Tabs
  tabsRow: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: ORANGE },
  tabLabel: { fontSize: 11, color: '#6b7280', fontWeight: '600' },
  tabBadge: { position: 'absolute', top: -6, right: -12, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: RED, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  // CS cards (descuento / saldo)
  csConcepto: { fontSize: 12, color: '#374151', marginTop: 4 },
  csRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  csMonto: { fontSize: 16, fontWeight: '800' },
  csBy: { fontSize: 11, color: '#9ca3af', flexShrink: 1, textAlign: 'right', marginLeft: 8 },
  csActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  csBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10 },
  csBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  // PIN modal
  pinOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  pinCard: { width: '100%', backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  pinTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  pinSub: { fontSize: 12, color: '#6b7280', marginTop: 4, marginBottom: 12 },
  pinInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: '#111', marginBottom: 10 },
  pinError: { color: RED, fontSize: 12, marginBottom: 8 },
  pinActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
});
