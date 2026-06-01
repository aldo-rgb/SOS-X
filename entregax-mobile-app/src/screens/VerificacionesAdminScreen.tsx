import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  StyleSheet, RefreshControl, Alert, Modal, ScrollView, Image,
  StatusBar,
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

      {loading ? (
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
      )}

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
});
