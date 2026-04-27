/**
 * ChinaAirReceptionScreen - Wizard de Recepción AWB (TDI Aéreo China)
 * Espejo móvil de ChinaAirReceptionWizard (web)
 *  Step 0: Lista de AWBs en tránsito → seleccionar
 *  Step 1: Escanear guías
 *  Step 2: Confirmar / resultado
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Modal, Vibration,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#1A1A1A';
const RED = '#E53935';
const GREEN = '#2E7D32';

interface Awb {
  id: number;
  awb_number: string;
  carrier: string | null;
  flight_number: string | null;
  flight_date: string | null;
  origin_airport: string | null;
  destination_airport: string | null;
  gross_weight_kg: string | number | null;
  total_packages: number;
  received_packages: number;
  created_at: string | null;
}

interface Pkg {
  id: number;
  tracking_internal: string;
  status: string;
  description: string | null;
  weight: string | number | null;
  missing_on_arrival: boolean;
  user_box_id: string | null;
  user_name: string | null;
}

const cleanTracking = (raw: string): string => {
  let t = raw.trim();
  if (!t) return '';
  const afterTrack = t.match(/track[^A-Za-z0-9]+([A-Za-z]{2})[^A-Za-z0-9]?([A-Za-z0-9]{4,})/i);
  if (afterTrack) return `${afterTrack[1]}-${afterTrack[2]}`.toUpperCase();
  const matches = t.match(/[A-Z]{2}[-_']?[A-Z0-9]{4,}/gi) || [];
  let candidate = matches.find((m) => !/TREGAX/i.test(m));
  if (candidate) {
    let c = candidate.replace(/[_']/g, '-').toUpperCase();
    if (!c.includes('-') && c.length > 2) c = c.slice(0, 2) + '-' + c.slice(2);
    return c;
  }
  return t.toUpperCase();
};

export default function ChinaAirReceptionScreen({ route, navigation }: any) {
  const { token } = route.params;
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();

  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [awbs, setAwbs] = useState<Awb[]>([]);
  const [selected, setSelected] = useState<Awb | null>(null);

  const [packages, setPackages] = useState<Pkg[]>([]);
  const [scanInput, setScanInput] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);
  const inputRef = useRef<TextInput | null>(null);
  const lockRef = useRef(false);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [confirmPartial, setConfirmPartial] = useState(false);
  const [result, setResult] = useState<{ scanned: number; missing: number; total: number } | null>(null);

  const loadAwbs = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/china-air/awbs/in-transit`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setAwbs(data.awbs || []);
    } catch (e: any) {
      setError(e.message || 'Error al cargar AWBs');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadAwbs(); }, [loadAwbs]);

  useEffect(() => {
    if (step === 1) {
      setTimeout(() => inputRef.current?.focus(), 350);
      setTimeout(() => inputRef.current?.focus(), 700);
    }
  }, [step]);

  const openAwb = async (awb: Awb) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/china-air/awbs/${awb.id}/packages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setPackages(data.packages || []);
      setSelected(awb);
      setStep(1);
    } catch (e: any) {
      setError(e.message || 'Error');
    } finally { setLoading(false); }
  };

  const refreshPackages = async () => {
    if (!selected) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/china-air/awbs/${selected.id}/packages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setPackages(data.packages || []);
    } catch { /* noop */ }
  };

  const handleScan = async (raw: string) => {
    if (!selected) return;
    const tracking = cleanTracking(raw);
    if (!tracking) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/china-air/awbs/${selected.id}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tracking }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al escanear');
      if (data.already_received) {
        setFeedback({ type: 'info', msg: `Ya escaneado: ${data.package?.tracking_internal || tracking}` });
      } else {
        Vibration.vibrate(50);
        setFeedback({ type: 'success', msg: `✓ ${data.package?.tracking_internal || tracking}` });
      }
      await refreshPackages();
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
    const missing = packages.filter((p) => p.status !== 'received_mty').length;
    if (missing > 0 && !forcePartial) { setConfirmPartial(true); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/china-air/awbs/${selected.id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ allow_partial: forcePartial }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setResult({ scanned: data.received, missing: data.missing, total: data.total });
      setConfirmPartial(false);
      setStep(2);
    } catch (e: any) {
      setError(e.message || 'Error');
      setConfirmPartial(false);
    } finally { setLoading(false); }
  };

  const reset = () => {
    setStep(0); setSelected(null); setPackages([]); setScanInput('');
    setFeedback(null); setResult(null);
    loadAwbs();
  };

  const receivedCount = packages.filter((p) => p.status === 'received_mty').length;
  const missingCount = packages.length - receivedCount;

  // ================== RENDER ==================
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Ionicons name="airplane" size={20} color={ORANGE} style={{ marginHorizontal: 8 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Recibir AWB</Text>
          <Text style={styles.headerSubtitle}>TDI Aéreo China</Text>
        </View>
        {step === 0 && (
          <TouchableOpacity onPress={loadAwbs}>
            <Ionicons name="refresh" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Stepper */}
      <View style={styles.stepper}>
        {['Seleccionar AWB', 'Escanear', 'Confirmar'].map((label, i) => (
          <View key={i} style={styles.stepItem}>
            <View style={[styles.stepDot, step >= i && styles.stepDotActive]}>
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

      {/* STEP 0 */}
      {step === 0 && (
        <ScrollView contentContainerStyle={{ padding: 12 }}>
          {loading ? (
            <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 40 }} />
          ) : awbs.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="airplane-outline" size={48} color="#999" />
              <Text style={styles.emptyText}>No hay AWBs pendientes de recepción</Text>
            </View>
          ) : (
            awbs.map((awb) => {
              const start = awb.flight_date || awb.created_at;
              const days = start ? Math.floor((Date.now() - new Date(start).getTime()) / 86400000) : null;
              const dayColor = days === null ? '#999' : days <= 2 ? GREEN : days <= 5 ? '#F9A825' : RED;
              const isPartial = Number(awb.received_packages) > 0 && Number(awb.received_packages) < Number(awb.total_packages);
              return (
                <TouchableOpacity key={awb.id} style={styles.awbCard} onPress={() => openAwb(awb)} activeOpacity={0.85}>
                  <View style={styles.awbBadge}>
                    <Text style={styles.awbBadgeNum}>{awb.total_packages}</Text>
                    <Text style={styles.awbBadgeLbl}>{Number(awb.total_packages) === 1 ? 'PAQUETE' : 'PAQUETES'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.awbNum}>AWB {awb.awb_number}</Text>
                    {awb.received_packages > 0 && (
                      <View style={[styles.miniChip, { backgroundColor: '#E8F5E9' }]}>
                        <Ionicons name="checkmark-circle" size={12} color={GREEN} />
                        <Text style={[styles.miniChipText, { color: GREEN }]}>
                          {awb.received_packages}/{awb.total_packages} recibidos
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={[styles.statusChip, { backgroundColor: isPartial ? ORANGE : BLACK }]}>
                      <Text style={styles.statusChipText}>{isPartial ? 'PARCIAL' : 'PENDIENTE'}</Text>
                    </View>
                    {days !== null && (
                      <View style={[styles.dayChip, { backgroundColor: dayColor }]}>
                        <Text style={styles.dayChipText}>{days} día{days === 1 ? '' : 's'}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {/* STEP 1 */}
      {step === 1 && selected && (
        <View style={{ flex: 1 }}>
          <View style={styles.awbBanner}>
            <Text style={styles.bannerLbl}>
              AWB {selected.awb_number}
              {selected.carrier ? ` · ${selected.carrier}` : ''}
              {selected.flight_number ? ` · ${selected.flight_number}` : ''}
            </Text>
            <Text style={styles.bannerTitle}>
              {selected.origin_airport || '?'} → {selected.destination_airport || '?'}
              {selected.gross_weight_kg ? ` · ${Number(selected.gross_weight_kg).toFixed(2)} kg` : ''}
            </Text>
            <View style={styles.bannerChips}>
              <View style={[styles.miniChip, { backgroundColor: BLACK }]}>
                <Text style={[styles.miniChipText, { color: '#fff' }]}>Total: {packages.length}</Text>
              </View>
              <View style={[styles.miniChip, { backgroundColor: '#E8F5E9' }]}>
                <Ionicons name="checkmark-circle" size={12} color={GREEN} />
                <Text style={[styles.miniChipText, { color: GREEN }]}>Escaneados: {receivedCount}</Text>
              </View>
              <View style={[styles.miniChip, { backgroundColor: missingCount === 0 ? '#EEE' : RED }]}>
                <Text style={[styles.miniChipText, { color: missingCount === 0 ? '#666' : '#fff' }]}>
                  Faltantes: {missingCount}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.scanRow}>
            <TextInput
              ref={inputRef}
              style={styles.scanInput}
              placeholder="Escanear guía (US-XXXXX)..."
              placeholderTextColor="#999"
              value={scanInput}
              onChangeText={setScanInput}
              onSubmitEditing={() => handleScan(scanInput)}
              autoCapitalize="characters"
              autoFocus
              blurOnSubmit={false}
              returnKeyType="done"
            />
            <TouchableOpacity style={styles.scanIconBtn} onPress={async () => {
              if (!permission?.granted) { const r = await requestPermission(); if (!r.granted) return; }
              setCameraOpen(true);
            }}>
              <Ionicons name="barcode-outline" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.scanIconBtn} onPress={() => handleScan(scanInput)}>
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {feedback && (
            <View style={[
              styles.feedback,
              { backgroundColor: feedback.type === 'success' ? '#E8F5E9' : feedback.type === 'error' ? '#FFEBEE' : '#E3F2FD' }
            ]}>
              <Text style={{
                color: feedback.type === 'success' ? GREEN : feedback.type === 'error' ? RED : '#1976D2',
                fontWeight: '600',
              }}>
                {feedback.msg}
              </Text>
              <TouchableOpacity onPress={() => setFeedback(null)}>
                <Ionicons name="close" size={16} color="#666" />
              </TouchableOpacity>
            </View>
          )}

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 8 }}>
            {packages.map((p) => {
              const ok = p.status === 'received_mty';
              const wasMissing = p.missing_on_arrival === true;
              return (
                <View key={p.id} style={[
                  styles.pkgRow,
                  { backgroundColor: ok ? '#E8F5E9' : wasMissing ? '#FFF4E5' : '#fff' },
                ]}>
                  <Ionicons
                    name={ok ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={ok ? GREEN : wasMissing ? '#F9A825' : '#BBB'}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pkgTracking}>{p.tracking_internal}</Text>
                    <Text style={styles.pkgSub}>
                      {p.user_box_id ? `${p.user_box_id} · ` : ''}{p.user_name || 'Sin cliente'}
                    </Text>
                    <Text style={styles.pkgSubMini}>
                      {p.description || 'Sin descripción'} · {Number(p.weight || 0).toFixed(2)} kg
                    </Text>
                  </View>
                  {ok && <View style={[styles.tag, { backgroundColor: GREEN }]}><Text style={styles.tagText}>✓</Text></View>}
                  {wasMissing && !ok && <View style={[styles.tag, { backgroundColor: '#F9A825' }]}><Text style={styles.tagText}>⏳</Text></View>}
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.btnSecondary} onPress={() => setStep(0)} disabled={loading}>
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

      {/* STEP 2 */}
      {step === 2 && result && (
        <ScrollView contentContainerStyle={{ padding: 24, alignItems: 'center' }}>
          <Ionicons name="checkmark-circle" size={80} color={result.missing === 0 ? GREEN : ORANGE} />
          <Text style={styles.resultTitle}>
            {result.missing === 0 ? 'Recepción completa' : 'Recepción parcial registrada'}
          </Text>
          <Text style={styles.resultSub}>AWB {selected?.awb_number}</Text>
          <View style={styles.resultRow}>
            <View style={styles.resultCell}>
              <Text style={[styles.resultNum, { color: GREEN }]}>{result.scanned}</Text>
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
          <TouchableOpacity style={[styles.btnPrimary, { marginTop: 24, paddingHorizontal: 30 }]} onPress={reset}>
            <Text style={styles.btnPrimaryText}>Recibir otra AWB</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnSecondary, { marginTop: 10 }]} onPress={() => navigation.goBack()}>
            <Text style={styles.btnSecondaryText}>Volver al menú</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* CAMERA MODAL */}
      <Modal visible={cameraOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setCameraOpen(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {permission?.granted && (
            <CameraView
              style={{ flex: 1 }}
              barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'pdf417'] }}
              onBarcodeScanned={onCameraScan}
            />
          )}
          <TouchableOpacity
            style={[styles.cameraClose, { top: insets.top + 10 }]}
            onPress={() => setCameraOpen(false)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>

      {/* CONFIRM PARTIAL */}
      <Modal visible={confirmPartial} transparent animationType="fade" onRequestClose={() => setConfirmPartial(false)}>
        <View style={styles.dialogBg}>
          <View style={styles.dialog}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="warning" size={22} color={ORANGE} />
              <Text style={styles.dialogTitle}>Confirmar recepción parcial</Text>
            </View>
            <Text style={styles.dialogText}>
              Faltan <Text style={{ fontWeight: '800' }}>{missingCount}</Text> de {packages.length} paquetes por escanear.
            </Text>
            <Text style={[styles.dialogText, { color: '#666', marginTop: 8 }]}>
              Los escaneados quedarán como recibidos en MTY. Los faltantes se marcarán como retrasados.
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
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  headerSubtitle: { fontSize: 11, color: '#fff', opacity: 0.7 },

  stepper: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#EEE' },
  stepItem: { flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  stepDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#DDD', alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { backgroundColor: ORANGE },
  stepNum: { fontSize: 12, fontWeight: '800', color: '#666' },
  stepLabel: { fontSize: 11, color: '#999', flexShrink: 1 },
  stepLabelActive: { color: BLACK, fontWeight: '700' },

  errorBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFEBEE', padding: 10, marginHorizontal: 12, marginTop: 10, borderRadius: 8 },
  errorText: { color: RED, flex: 1, fontWeight: '600' },

  emptyState: { alignItems: 'center', padding: 40 },
  emptyText: { color: '#999', marginTop: 10 },

  awbCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, alignItems: 'center', gap: 12, borderLeftWidth: 4, borderLeftColor: ORANGE },
  awbBadge: { backgroundColor: ORANGE, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, alignItems: 'center', minWidth: 70 },
  awbBadgeNum: { fontSize: 24, fontWeight: '900', color: '#fff', lineHeight: 28 },
  awbBadgeLbl: { fontSize: 8, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  awbNum: { fontSize: 16, fontWeight: '800', color: ORANGE },

  miniChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, marginTop: 4, alignSelf: 'flex-start' },
  miniChipText: { fontSize: 10, fontWeight: '700' },
  statusChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusChipText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  dayChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  dayChipText: { fontSize: 10, fontWeight: '700', color: '#fff' },

  awbBanner: { backgroundColor: '#FFF5F0', borderWidth: 2, borderColor: ORANGE, padding: 12, margin: 10, borderRadius: 10 },
  bannerLbl: { fontSize: 11, color: '#666' },
  bannerTitle: { fontSize: 16, fontWeight: '800', color: BLACK, marginTop: 2 },
  bannerChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },

  scanRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  scanInput: { flex: 1, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1, borderColor: '#DDD', color: BLACK },
  scanIconBtn: { backgroundColor: ORANGE, width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  feedback: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 12, marginTop: 8, padding: 10, borderRadius: 8 },

  pkgRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8, marginBottom: 6 },
  pkgTracking: { fontFamily: 'monospace', fontWeight: '700', fontSize: 13, color: BLACK },
  pkgSub: { fontSize: 11, color: '#444', marginTop: 2 },
  pkgSubMini: { fontSize: 10, color: '#888' },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tagText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  footer: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#EEE' },
  btnPrimary: { flex: 1, backgroundColor: ORANGE, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnSecondary: { flex: 1, backgroundColor: '#F5F5F5', paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#DDD' },
  btnSecondaryText: { color: BLACK, fontWeight: '700', fontSize: 14 },

  resultTitle: { fontSize: 22, fontWeight: '800', color: BLACK, marginTop: 14, textAlign: 'center' },
  resultSub: { color: '#666', marginTop: 4 },
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
