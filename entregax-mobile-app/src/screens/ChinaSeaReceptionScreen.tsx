/**
 * ChinaSeaReceptionScreen - Wizard recepción de Contenedores (TDI Marítimo China)
 * Param `mode`: 'LCL' (default) | 'FCL'
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Modal, Vibration,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { API_URL } from '../services/api';

const TEAL = '#0097A7';
const ORANGE = '#F05A28';
const BLACK = '#1A1A1A';
const RED = '#E53935';
const GREEN = '#2E7D32';

interface Container {
  id: number;
  container_number: string | null;
  bl_number: string | null;
  reference_code: string | null;
  vessel_name: string | null;
  voyage_number: string | null;
  eta: string | null;
  week_number: string | null;
  type: string | null;
  total_orders: number;
  received_orders: number;
  total_weight_kg: string | number | null;
  total_cbm: string | number | null;
}

interface Order {
  id: number;
  ordersn: string;
  shipping_mark: string | null;
  goods_name: string | null;
  weight: string | number | null;
  volume: string | number | null;
  status: string;
  missing_on_arrival: boolean;
  user_box_id: string | null;
  user_name: string | null;
}

const cleanRef = (raw: string): string => {
  let r = raw.trim().replace(/[\s'_]/g, '').toUpperCase();
  const m = r.match(/[A-Z]{2,}\d+[A-Z0-9-]*/);
  if (m) r = m[0];
  return r;
};

export default function ChinaSeaReceptionScreen({ route, navigation }: any) {
  const { token, mode = 'LCL' } = route.params;
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const isFCL = mode === 'FCL';
  const accent = isFCL ? ORANGE : TEAL;

  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [containers, setContainers] = useState<Container[]>([]);
  const [selected, setSelected] = useState<Container | null>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [scanInput, setScanInput] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);
  const inputRef = useRef<TextInput | null>(null);
  const lockRef = useRef(false);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [confirmPartial, setConfirmPartial] = useState(false);
  const [result, setResult] = useState<{ received: number; missing: number; total: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/china-sea/containers/in-transit`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      const all: Container[] = data.containers || [];
      // Filtro web: LCL = tiene week_number "Week X"; FCL = no tiene
      const filtered = all.filter((c) => {
        const w = (c.week_number || '').toString().trim();
        const has = /week/i.test(w);
        return isFCL ? !has : has;
      });
      setContainers(filtered);
    } catch (e: any) {
      setError(e.message || 'Error');
    } finally { setLoading(false); }
  }, [token, isFCL]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (step === 1) {
      setTimeout(() => inputRef.current?.focus(), 350);
      setTimeout(() => inputRef.current?.focus(), 700);
    }
  }, [step]);

  const open = async (c: Container) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/china-sea/containers/${c.id}/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setOrders(data.orders || []);
      setSelected(c);
      setStep(1);
    } catch (e: any) { setError(e.message || 'Error'); } finally { setLoading(false); }
  };

  const refresh = async () => {
    if (!selected) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/china-sea/containers/${selected.id}/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setOrders(data.orders || []);
    } catch {}
  };

  const handleScan = async (raw: string) => {
    if (!selected) return;
    const reference = cleanRef(raw);
    if (!reference) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/china-sea/containers/${selected.id}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reference }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      if (data.already_received) {
        setFeedback({ type: 'info', msg: `Ya escaneado: ${data.order?.ordersn || reference}` });
      } else {
        Vibration.vibrate(50);
        setFeedback({ type: 'success', msg: `✓ ${data.order?.ordersn || reference}` });
      }
      await refresh();
    } catch (e: any) {
      Vibration.vibrate([0, 80, 50, 80]);
      setFeedback({ type: 'error', msg: e.message || 'Error' });
    }
    setScanInput('');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const onCameraScan = (r: BarcodeScanningResult) => {
    if (lockRef.current) return;
    lockRef.current = true;
    setCameraOpen(false);
    setTimeout(() => { lockRef.current = false; }, 1200);
    handleScan(r.data);
  };

  const finalize = async (forcePartial = false) => {
    if (!selected) return;
    const missing = orders.filter((o) => o.status !== 'received_mty').length;
    if (missing > 0 && !forcePartial) { setConfirmPartial(true); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/china-sea/containers/${selected.id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ allow_partial: forcePartial }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setResult({ received: data.received, missing: data.missing, total: data.total });
      setConfirmPartial(false);
      setStep(2);
    } catch (e: any) { setError(e.message || 'Error'); setConfirmPartial(false); } finally { setLoading(false); }
  };

  const reset = () => {
    setStep(0); setSelected(null); setOrders([]); setScanInput('');
    setFeedback(null); setResult(null);
    load();
  };

  const receivedCount = orders.filter((o) => o.status === 'received_mty').length;
  const missingCount = orders.length - receivedCount;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={[styles.header]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Ionicons name="boat" size={20} color={accent} style={{ marginHorizontal: 8 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{isFCL ? 'Actualizar Status Full Conteiner' : 'Recibir Contenedor'}</Text>
          <Text style={styles.headerSubtitle}>TDI Marítimo China · {mode}</Text>
        </View>
        {step === 0 && (
          <TouchableOpacity onPress={load}>
            <Ionicons name="refresh" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.stepper}>
        {['Seleccionar', 'Escanear', 'Confirmar'].map((label, i) => (
          <View key={i} style={styles.stepItem}>
            <View style={[styles.stepDot, step >= i && { backgroundColor: accent }]}>
              <Text style={[styles.stepNum, step >= i && { color: '#fff' }]}>{i + 1}</Text>
            </View>
            <Text style={[styles.stepLabel, step === i && styles.stepLabelActive]} numberOfLines={1}>{label}</Text>
          </View>
        ))}
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}><Ionicons name="close" size={18} color={RED} /></TouchableOpacity>
        </View>
      )}

      {step === 0 && (
        <ScrollView contentContainerStyle={{ padding: 12 }}>
          {loading ? (
            <ActivityIndicator size="large" color={accent} style={{ marginTop: 40 }} />
          ) : containers.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="boat-outline" size={48} color="#999" />
              <Text style={styles.emptyText}>No hay contenedores {mode} pendientes</Text>
            </View>
          ) : (
            containers.map((c) => {
              const eta = c.eta;
              const days = eta ? Math.floor((new Date(eta).getTime() - Date.now()) / 86400000) : null;
              const arrived = days !== null && days <= 0;
              const isPartial = Number(c.received_orders) > 0 && Number(c.received_orders) < Number(c.total_orders);
              const cFCL = (c.type || '').toUpperCase() === 'FCL';
              const count = cFCL ? 1 : Number(c.total_orders || 0);
              const lbl = cFCL ? 'CONTENEDOR' : count === 1 ? 'LOG' : 'LOGS';
              return (
                <TouchableOpacity key={c.id} style={[styles.containerCard, { borderLeftColor: accent }]} onPress={() => open(c)} activeOpacity={0.85}>
                  <View style={[styles.refBadge, { backgroundColor: accent }]}>
                    <Text style={styles.refBadgeNum}>{count}</Text>
                    <Text style={styles.refBadgeLbl}>{lbl}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.refCode, { color: accent }]}>
                      {c.reference_code || c.container_number || c.bl_number || '—'}
                    </Text>
                    {c.vessel_name && <Text style={styles.subText}>{c.vessel_name}</Text>}
                    {c.received_orders > 0 && (
                      <View style={[styles.miniChip, { backgroundColor: '#E8F5E9' }]}>
                        <Ionicons name="checkmark-circle" size={12} color={GREEN} />
                        <Text style={[styles.miniChipText, { color: GREEN }]}>
                          {c.received_orders}/{c.total_orders} recibidas
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={[styles.statusChip, { backgroundColor: isPartial ? ORANGE : arrived ? GREEN : BLACK }]}>
                      <Text style={styles.statusChipText}>
                        {isPartial ? 'PARCIAL' : arrived ? 'EN PUERTO' : 'EN TRÁNSITO'}
                      </Text>
                    </View>
                    {days !== null && (
                      <Text style={styles.dayText}>
                        {days > 0 ? `En ${days}d` : days === 0 ? 'ETA hoy' : `Hace ${Math.abs(days)}d`}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {step === 1 && selected && (
        <View style={{ flex: 1 }}>
          <View style={[styles.banner, { borderColor: accent, backgroundColor: accent + '15' }]}>
            <Text style={styles.bannerLbl}>
              {selected.reference_code || '—'} · Cont. {selected.container_number || '—'}
              {selected.bl_number ? ` · BL ${selected.bl_number}` : ''}
            </Text>
            <Text style={styles.bannerTitle}>
              {selected.vessel_name || 'Buque sin asignar'}
              {selected.voyage_number ? ` · V${selected.voyage_number}` : ''}
            </Text>
            <View style={styles.bannerChips}>
              <View style={[styles.miniChip, { backgroundColor: BLACK }]}>
                <Text style={[styles.miniChipText, { color: '#fff' }]}>Total: {orders.length}</Text>
              </View>
              <View style={[styles.miniChip, { backgroundColor: '#E8F5E9' }]}>
                <Text style={[styles.miniChipText, { color: GREEN }]}>OK: {receivedCount}</Text>
              </View>
              <View style={[styles.miniChip, { backgroundColor: missingCount === 0 ? '#EEE' : RED }]}>
                <Text style={[styles.miniChipText, { color: missingCount === 0 ? '#666' : '#fff' }]}>
                  Faltan: {missingCount}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.scanRow}>
            <TextInput
              ref={inputRef}
              style={styles.scanInput}
              placeholder="Escanear referencia (LOG..., shipping mark)..."
              placeholderTextColor="#999"
              value={scanInput}
              onChangeText={setScanInput}
              onSubmitEditing={() => handleScan(scanInput)}
              autoCapitalize="characters"
              autoFocus
              blurOnSubmit={false}
              returnKeyType="done"
            />
            <TouchableOpacity style={[styles.scanIconBtn, { backgroundColor: accent }]} onPress={async () => {
              if (!permission?.granted) { const r = await requestPermission(); if (!r.granted) return; }
              setCameraOpen(true);
            }}>
              <Ionicons name="barcode-outline" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.scanIconBtn, { backgroundColor: accent }]} onPress={() => handleScan(scanInput)}>
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {feedback && (
            <View style={[styles.feedback, {
              backgroundColor: feedback.type === 'success' ? '#E8F5E9' : feedback.type === 'error' ? '#FFEBEE' : '#E3F2FD'
            }]}>
              <Text style={{ color: feedback.type === 'success' ? GREEN : feedback.type === 'error' ? RED : '#1976D2', fontWeight: '600' }}>
                {feedback.msg}
              </Text>
              <TouchableOpacity onPress={() => setFeedback(null)}>
                <Ionicons name="close" size={16} color="#666" />
              </TouchableOpacity>
            </View>
          )}

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 8 }}>
            {orders.map((o) => {
              const ok = o.status === 'received_mty';
              const wasMissing = o.missing_on_arrival === true;
              return (
                <View key={o.id} style={[styles.row, { backgroundColor: ok ? '#E8F5E9' : wasMissing ? '#FFF4E5' : '#fff' }]}>
                  <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={ok ? GREEN : wasMissing ? '#F9A825' : '#BBB'} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tracking}>{o.ordersn}</Text>
                    <Text style={styles.subRow}>
                      {o.user_box_id ? `${o.user_box_id} · ` : ''}{o.user_name || 'Sin cliente'}
                    </Text>
                    <Text style={styles.subMini}>
                      {o.goods_name || '—'} · {Number(o.weight || 0).toFixed(2)} kg · {Number(o.volume || 0).toFixed(3)} m³
                    </Text>
                    {o.shipping_mark ? <Text style={styles.subMini}>Mark: {o.shipping_mark}</Text> : null}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.btnSecondary} onPress={() => setStep(0)}>
              <Text style={styles.btnSecondaryText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: missingCount === 0 ? GREEN : ORANGE, opacity: receivedCount === 0 ? 0.5 : 1 }]}
              onPress={() => finalize(false)}
              disabled={loading || receivedCount === 0}
            >
              <Text style={styles.btnPrimaryText}>
                {missingCount === 0 ? 'Finalizar completa' : `Finalizar (${missingCount} faltantes)`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {step === 2 && result && (
        <ScrollView contentContainerStyle={{ padding: 24, alignItems: 'center' }}>
          <Ionicons name="checkmark-circle" size={80} color={result.missing === 0 ? GREEN : ORANGE} />
          <Text style={styles.resultTitle}>
            {result.missing === 0 ? 'Recepción completa' : 'Recepción parcial registrada'}
          </Text>
          <Text style={styles.resultSub}>
            {selected?.reference_code} · {selected?.container_number}
          </Text>
          <View style={styles.resultRow}>
            <View style={styles.resultCell}>
              <Text style={[styles.resultNum, { color: GREEN }]}>{result.received}</Text>
              <Text style={styles.resultLbl}>Recibidos</Text>
            </View>
            <View style={styles.resultCell}>
              <Text style={[styles.resultNum, { color: result.missing === 0 ? '#999' : RED }]}>{result.missing}</Text>
              <Text style={styles.resultLbl}>Faltantes</Text>
            </View>
            <View style={styles.resultCell}>
              <Text style={[styles.resultNum, { color: BLACK }]}>{result.total}</Text>
              <Text style={styles.resultLbl}>Total</Text>
            </View>
          </View>
          <TouchableOpacity style={[styles.btnPrimary, { marginTop: 24, paddingHorizontal: 30, backgroundColor: accent }]} onPress={reset}>
            <Text style={styles.btnPrimaryText}>Recibir otro</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnSecondary, { marginTop: 10 }]} onPress={() => navigation.goBack()}>
            <Text style={styles.btnSecondaryText}>Volver al menú</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      <Modal visible={cameraOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setCameraOpen(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {permission?.granted && (
            <CameraView
              style={{ flex: 1 }}
              barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'pdf417'] }}
              onBarcodeScanned={onCameraScan}
            />
          )}
          <TouchableOpacity style={[styles.cameraClose, { top: insets.top + 10 }]} onPress={() => setCameraOpen(false)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={confirmPartial} transparent animationType="fade" onRequestClose={() => setConfirmPartial(false)}>
        <View style={styles.dialogBg}>
          <View style={styles.dialog}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="warning" size={22} color={ORANGE} />
              <Text style={styles.dialogTitle}>Confirmar recepción parcial</Text>
            </View>
            <Text style={styles.dialogText}>
              Faltan <Text style={{ fontWeight: '800' }}>{missingCount}</Text> de {orders.length} órdenes por escanear.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} onPress={() => setConfirmPartial(false)}>
                <Text style={styles.btnSecondaryText}>Volver</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} onPress={() => finalize(true)} disabled={loading}>
                <Text style={styles.btnPrimaryText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: BLACK, paddingHorizontal: 14, paddingVertical: 14 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  headerSubtitle: { fontSize: 11, color: '#fff', opacity: 0.7 },
  stepper: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#EEE' },
  stepItem: { flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  stepDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#DDD', alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontSize: 12, fontWeight: '800', color: '#666' },
  stepLabel: { fontSize: 11, color: '#999', flexShrink: 1 },
  stepLabelActive: { color: BLACK, fontWeight: '700' },
  errorBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFEBEE', padding: 10, marginHorizontal: 12, marginTop: 10, borderRadius: 8 },
  errorText: { color: RED, flex: 1, fontWeight: '600' },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyText: { color: '#999', marginTop: 10 },
  containerCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, alignItems: 'center', gap: 12, borderLeftWidth: 4 },
  refBadge: { borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, alignItems: 'center', minWidth: 70 },
  refBadgeNum: { fontSize: 24, fontWeight: '900', color: '#fff', lineHeight: 28 },
  refBadgeLbl: { fontSize: 8, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  refCode: { fontSize: 16, fontWeight: '800', fontFamily: 'monospace' },
  subText: { fontSize: 11, color: '#666', marginTop: 2 },
  miniChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, marginTop: 4, alignSelf: 'flex-start' },
  miniChipText: { fontSize: 10, fontWeight: '700' },
  statusChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusChipText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  dayText: { fontSize: 11, color: '#666', fontWeight: '600' },
  banner: { borderWidth: 2, padding: 12, margin: 10, borderRadius: 10 },
  bannerLbl: { fontSize: 11, color: '#666' },
  bannerTitle: { fontSize: 14, fontWeight: '800', color: BLACK, marginTop: 2 },
  bannerChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  scanInput: { flex: 1, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1, borderColor: '#DDD', color: BLACK },
  scanIconBtn: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  feedback: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 12, marginTop: 8, padding: 10, borderRadius: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8, marginBottom: 6 },
  tracking: { fontFamily: 'monospace', fontWeight: '700', fontSize: 13, color: BLACK },
  subRow: { fontSize: 11, color: '#444', marginTop: 2 },
  subMini: { fontSize: 10, color: '#888' },
  footer: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#EEE' },
  btnPrimary: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', backgroundColor: ORANGE },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnSecondary: { flex: 1, backgroundColor: '#F5F5F5', paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#DDD' },
  btnSecondaryText: { color: BLACK, fontWeight: '700', fontSize: 14 },
  resultTitle: { fontSize: 22, fontWeight: '800', color: BLACK, marginTop: 14, textAlign: 'center' },
  resultSub: { color: '#666', marginTop: 4, textAlign: 'center' },
  resultRow: { flexDirection: 'row', gap: 30, marginTop: 24 },
  resultCell: { alignItems: 'center' },
  resultNum: { fontSize: 32, fontWeight: '900' },
  resultLbl: { fontSize: 11, color: '#666', marginTop: 2 },
  cameraClose: { position: 'absolute', right: 16, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dialogBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  dialog: { backgroundColor: '#fff', borderRadius: 12, padding: 16, width: '100%', maxWidth: 400 },
  dialogTitle: { fontSize: 16, fontWeight: '800', color: BLACK },
  dialogText: { fontSize: 13, color: '#333' },
});
