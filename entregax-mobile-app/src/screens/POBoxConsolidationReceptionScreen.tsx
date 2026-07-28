/**
 * POBoxConsolidationReceptionScreen — Recibir Consolidación (PO Box)
 * Escanea y valida las consolidaciones PO Box que llegan a CEDIS MTY.
 *  Paso 1: elegir una consolidación en tránsito.
 *  Paso 2: escanear cada guía → Finalizar (marca received_mty; faltantes opcional).
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const GREEN = '#2E7D32';
const BLACK = '#1A1A1A';

interface Consolidation {
  id: number;
  box_id: string | null;
  user_name: string | null;
  master_tracking: string | null;
  total_packages: number;
}
interface Pkg {
  id: number;
  tracking_internal: string;
  client_name: string | null;
  client_box_id: string | null;
}

const compact = (s: string) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export default function POBoxConsolidationReceptionScreen({ route, navigation }: any) {
  const { token } = route.params;
  const [step, setStep] = useState<'list' | 'scan'>('list');
  const [consolidations, setConsolidations] = useState<Consolidation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selected, setSelected] = useState<Consolidation | null>(null);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [scanned, setScanned] = useState<Set<number>>(new Set());
  const [code, setCode] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err' | 'warn'; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const loadList = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/pobox/consolidations/in-transit`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { const d = await res.json(); setConsolidations(d.consolidations || []); }
    } catch (e) { console.error('load consolidations:', e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useEffect(() => { loadList(); }, [loadList]);

  const openConsolidation = async (c: Consolidation) => {
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/pobox/consolidations/${c.id}/packages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setSelected(c);
        setPackages(d.packages || []);
        setScanned(new Set());
        setFeedback(null);
        setStep('scan');
        setTimeout(() => inputRef.current?.focus(), 250);
      } else { Alert.alert('Error', 'No se pudieron cargar las guías'); }
    } catch (e: any) { Alert.alert('Error', e?.message || 'Error de red'); }
    finally { setBusy(false); }
  };

  const scan = useCallback((raw: string) => {
    const c = compact(raw);
    if (!c) return;
    Keyboard.dismiss();
    // Match por compacto (tolerante a guiones/ceros del sufijo)
    const match = packages.find((p) => {
      const t = compact(p.tracking_internal);
      return t === c || t.startsWith(c) || c.startsWith(t);
    });
    if (!match) {
      setFeedback({ type: 'err', msg: `❌ ${raw.trim()} no pertenece a esta consolidación` });
    } else if (scanned.has(match.id)) {
      setFeedback({ type: 'warn', msg: `⚠️ ${match.tracking_internal} ya fue escaneada` });
    } else {
      setScanned((prev) => new Set(prev).add(match.id));
      setFeedback({ type: 'ok', msg: `✅ ${match.tracking_internal}` });
    }
    setCode('');
    setTimeout(() => inputRef.current?.focus(), 120);
  }, [packages, scanned]);

  const finalize = async (forcePartial: boolean) => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/pobox/consolidations/${selected.id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scanned_package_ids: Array.from(scanned), force_partial: forcePartial }),
      });
      const d = await res.json();
      if (res.ok && d.success !== false) {
        Alert.alert('Consolidación recibida', `Se marcaron ${scanned.size} guía(s) como Recibido MTY.`, [
          { text: 'OK', onPress: () => { setStep('list'); setSelected(null); loadList(); } },
        ]);
      } else { Alert.alert('Error', d.error || 'No se pudo finalizar'); }
    } catch (e: any) { Alert.alert('Error', e?.message || 'Error de red'); }
    finally { setBusy(false); }
  };

  const onFinalizePress = () => {
    const missing = packages.length - scanned.size;
    if (missing > 0) {
      Alert.alert(
        'Guías faltantes',
        `Escaneaste ${scanned.size} de ${packages.length}. ${missing} guía(s) quedarán marcadas como FALTANTES. ¿Finalizar de todos modos?`,
        [{ text: 'Cancelar', style: 'cancel' }, { text: 'Finalizar parcial', style: 'destructive', onPress: () => finalize(true) }]
      );
    } else {
      finalize(false);
    }
  };

  // ── Paso 1: lista ──
  if (step === 'list') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.headerLabel}>PO BOX · ENTREGAX</Text>
            <Text style={styles.headerTitle}>Recibir Consolidación</Text>
            <Text style={styles.headerSubtitle}>Consolidaciones en tránsito a MTY</Text>
          </View>
        </View>
        {loading ? (
          <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 60 }} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.body}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadList(); }} colors={[ORANGE]} />}
          >
            {consolidations.length === 0 ? (
              <View style={{ alignItems: 'center', marginTop: 50 }}>
                <Ionicons name="checkmark-done-circle-outline" size={44} color="#ccc" />
                <Text style={{ color: '#999', marginTop: 12 }}>No hay consolidaciones en tránsito</Text>
              </View>
            ) : consolidations.map((c) => (
              <TouchableOpacity key={c.id} style={styles.consCard} onPress={() => openConsolidation(c)} disabled={busy} activeOpacity={0.85}>
                <View style={styles.consIcon}><Ionicons name="cube-outline" size={26} color="#fff" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.consTitle}>{c.master_tracking || `Consolidación #${c.id}`}</Text>
                  <Text style={styles.consSub}>{c.user_name || 'Varios clientes'}{c.box_id ? ` · ${c.box_id}` : ''}</Text>
                  <Text style={styles.consCount}>{c.total_packages} guía(s)</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={ORANGE} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    );
  }

  // ── Paso 2: escaneo ──
  const missing = packages.length - scanned.size;
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setStep('list')} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.headerLabel}>PO BOX · ENTREGAX</Text>
          <Text style={styles.headerTitle}>{selected?.master_tracking || `Consolidación #${selected?.id}`}</Text>
          <Text style={styles.headerSubtitle}>{scanned.size} / {packages.length} escaneadas</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.scanCard}>
          <View style={styles.inputRow}>
            <Ionicons name="qr-code-outline" size={22} color={ORANGE} style={{ marginRight: 8 }} />
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Escanea la guía (US-XXXX)"
              placeholderTextColor="#999"
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => scan(code)}
            />
          </View>
          <TouchableOpacity style={[styles.btn, !code.trim() && { opacity: 0.6 }]} onPress={() => scan(code)} disabled={!code.trim()} activeOpacity={0.85}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#fff" /><Text style={styles.btnText}>Validar</Text>
          </TouchableOpacity>
        </View>

        {feedback && (
          <View style={[styles.feedback, feedback.type === 'ok' ? styles.fbOk : feedback.type === 'warn' ? styles.fbWarn : styles.fbErr]}>
            <Text style={[styles.fbText, { color: feedback.type === 'ok' ? GREEN : feedback.type === 'warn' ? '#B06B0C' : '#C0392B' }]}>{feedback.msg}</Text>
          </View>
        )}

        {packages.map((p) => {
          const done = scanned.has(p.id);
          return (
            <View key={p.id} style={[styles.item, done && { backgroundColor: '#F1FBF3' }]}>
              <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={done ? GREEN : '#CCC'} style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTracking}>{p.tracking_internal}</Text>
                <Text style={styles.itemClient}>{p.client_name || '—'} · {p.client_box_id || '—'}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.finalizeBtn, { backgroundColor: missing > 0 ? '#C2410C' : GREEN }, busy && { opacity: 0.6 }]}
          onPress={onFinalizePress}
          disabled={busy || scanned.size === 0}
          activeOpacity={0.85}
        >
          {busy ? <ActivityIndicator color="#fff" /> : (
            <Text style={styles.finalizeText}>
              {missing > 0 ? `Finalizar (${scanned.size}/${packages.length} · ${missing} faltan)` : `Finalizar (${scanned.size})`}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: BLACK,
    paddingHorizontal: 16, paddingVertical: 16,
  },
  headerLabel: { fontSize: 10, color: ORANGE, fontWeight: '800', letterSpacing: 1.5 },
  headerTitle: { fontSize: 19, fontWeight: '900', color: '#fff', marginTop: 2 },
  headerSubtitle: { fontSize: 12, color: '#fff', opacity: 0.7, marginTop: 3 },
  body: { padding: 14, gap: 12, paddingBottom: 30 },
  consCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 12 },
  consIcon: { width: 46, height: 46, borderRadius: 12, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
  consTitle: { fontSize: 15, fontWeight: '800', color: BLACK },
  consSub: { fontSize: 12, color: '#666', marginTop: 2 },
  consCount: { fontSize: 12, color: ORANGE, fontWeight: '700', marginTop: 3 },
  scanCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10, paddingHorizontal: 12, height: 50, marginBottom: 12 },
  input: { flex: 1, fontSize: 16, color: BLACK },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: ORANGE, borderRadius: 10, height: 48 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  feedback: { borderRadius: 10, padding: 12, borderWidth: 1 },
  fbOk: { backgroundColor: '#E4F0E7', borderColor: '#A5D6A7' },
  fbWarn: { backgroundColor: '#F6EAD3', borderColor: '#FFD8A8' },
  fbErr: { backgroundColor: '#F7E3E0', borderColor: '#F5B7B1' },
  fbText: { fontSize: 14, fontWeight: '600' },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12 },
  itemTracking: { fontSize: 14, fontWeight: '700', color: BLACK, fontFamily: 'monospace' },
  itemClient: { fontSize: 12, color: '#666', marginTop: 2 },
  footer: { padding: 14, borderTopWidth: 1, borderTopColor: '#EEE', backgroundColor: '#fff' },
  finalizeBtn: { borderRadius: 12, height: 54, alignItems: 'center', justifyContent: 'center' },
  finalizeText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
