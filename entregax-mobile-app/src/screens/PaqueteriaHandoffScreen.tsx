/**
 * PaqueteriaHandoffScreen — Escaneo de guías para entrega a paquetería
 *
 * Modos:
 *  - mostrador / recoleccion: scan interno → scan guía carrier → "Enviado"
 *  - cargar_unidad: scan interno → "En Ruta" (out_for_delivery)
 *
 * Basado en LoadingVanScreen.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Vibration, TextInput, Keyboard,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import api from '../services/api';

// Normaliza códigos escaneados con layout de teclado ES (scanner HID)
// Ñ→:  '→-  ¿→/  ¡→!  y extrae tracking de URL si es QR
const normalizeBarcode = (raw: string): string => {
  let v = raw.trim()
    .replace(/Ñ/g, ':')
    .replace(/ñ/g, ':')
    .replace(/'/g, '-')
    .replace(/¿/g, '/')
    .replace(/¡/g, '!');

  // Reparar URLs rotas por layout (httpsÑ--... → https://...)
  if (/^https?:-+/i.test(v)) {
    v = v.replace(/^(https?):-+/i, '$1://');
    v = v.replace(/([a-z]{2,}\.[a-z]{2,})-/gi, '$1/');
    v = v.replace(/track-/gi, 'track/');
  }

  // Extraer tracking de URL .../track/CODIGO o .../t/CODIGO
  const urlMatch = v.match(/(?:track|t)[/-]([A-Z0-9'_-]+)/i);
  if (urlMatch) v = urlMatch[1].replace(/'/g, '-');

  // Auto-insertar guion si viene pegado (US2722344044 → US-2722344044)
  const prefixMatch = v.toUpperCase().match(/^(US|AIR|LOG|TRK)(\d+)$/);
  if (prefixMatch) return `${prefixMatch[1]}-${prefixMatch[2]}`;

  return v.toUpperCase().trim();
};

type Mode = 'mostrador' | 'recoleccion' | 'cargar_unidad';
type ScanPhase = 'internal' | 'external';

interface HandoffPackage {
  id: number;
  tracking_number: string;
  national_carrier?: string | null;
  national_tracking?: string | null;
  delivery_address?: string;
  delivery_city?: string;
  recipient_name?: string;
  has_label?: boolean;
}

interface CompletedPkg {
  packageId: number;
  tracking: string;
  externalTracking?: string;
}

const ORANGE = '#F05A28';

function carrierLabel(carrier: string): string {
  return carrier.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

export default function PaqueteriaHandoffScreen({ navigation, route }: any) {
  const { carrier, mode, packages: initialPackages = [], token } = route.params as {
    carrier: string; mode: Mode; packages: HandoffPackage[]; token: string;
  };

  const [scanPhase, setScanPhase] = useState<ScanPhase>('internal');
  const [confirmedPackageId, setConfirmedPackageId] = useState<number | null>(null);
  const [confirmedTracking, setConfirmedTracking] = useState<string>('');
  const [manualCode, setManualCode] = useState('');
  const [completed, setCompleted] = useState<CompletedPkg[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err' | 'warn'; msg: string } | null>(null);
  const [showList, setShowList] = useState(false);

  const inputRef = useRef<TextInput | null>(null);
  const autoSubmitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInputTimeRef = useRef<number>(0);
  const recentDelaysRef = useRef<number[]>([]);

  const pendingPackages = initialPackages.filter(
    p => !completed.find(c => c.packageId === p.id)
  );

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  const showFeedback = (type: 'ok' | 'err' | 'warn', msg: string) => {
    setFeedback({ type, msg });
    if (type === 'err' || type === 'warn') Vibration.vibrate([0, 200, 100, 200]);
    else Vibration.vibrate(80);
    setTimeout(() => setFeedback(null), type === 'ok' ? 2000 : 4000);
  };

  const resetToInternal = () => {
    setScanPhase('internal');
    setConfirmedPackageId(null);
    setConfirmedTracking('');
    setManualCode('');
    setTimeout(() => inputRef.current?.focus(), 200);
  };

  const processCode = useCallback(async (rawCode: string) => {
    const code = normalizeBarcode(rawCode);
    if (!code.trim() || loading) return;
    setLoading(true);
    Keyboard.dismiss();
    setManualCode('');
    try {
      if (scanPhase === 'internal' || mode === 'cargar_unidad') {
        const res = await api.post('/api/driver/paqueteria-handoff/scan', {
          barcode: code.trim(),
          carrier,
          mode,
          phase: 'internal',
        }, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });

        if (mode === 'cargar_unidad') {
          // Verificar duplicado
          if (completed.find(c => c.packageId === res.data.packageId)) {
            showFeedback('warn', `⚠️ ${res.data.tracking} ya fue escaneado antes`);
            setTimeout(() => inputRef.current?.focus(), 200);
            return;
          }
          // Single scan complete
          setCompleted(prev => [...prev, {
            packageId: res.data.packageId,
            tracking: res.data.tracking,
          }]);
          showFeedback('ok', `✅ ${res.data.tracking} — Cargado a unidad`);
          setManualCode('');
          setTimeout(() => inputRef.current?.focus(), 100);
        } else {
          // Phase 1 done — ask for carrier guide
          setConfirmedPackageId(res.data.packageId);
          setConfirmedTracking(res.data.tracking);
          setScanPhase('external');
          setManualCode('');
          showFeedback('ok', `✅ ${res.data.tracking} — Ahora escanea guía de ${carrierLabel(carrier)}`);
          setTimeout(() => inputRef.current?.focus(), 300);
        }
      } else if (scanPhase === 'external' && confirmedPackageId) {
        const res = await api.post('/api/driver/paqueteria-handoff/scan', {
          barcode: code.trim(),
          carrier,
          mode,
          phase: 'external',
          packageId: confirmedPackageId,
          externalTracking: code.trim(),
        }, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });

        setCompleted(prev => [...prev, {
          packageId: confirmedPackageId,
          tracking: confirmedTracking,
          externalTracking: code.trim(),
        }]);
        showFeedback('ok', `✅ ${confirmedTracking} → ${code.trim()} — Enviado`);
        resetToInternal();
      }
    } catch (e: any) {
      const msg = e.response?.data?.error || e.message || 'Error';
      const isWarn = msg.includes('⚠️');
      showFeedback(isWarn ? 'warn' : 'err', msg);
      setTimeout(() => inputRef.current?.focus(), 200);
    } finally {
      setLoading(false);
    }
  }, [scanPhase, mode, carrier, confirmedPackageId, confirmedTracking, token, loading]);

  const handleTextChange = (text: string) => {
    const now = Date.now();
    const delay = now - lastInputTimeRef.current;
    lastInputTimeRef.current = now;
    recentDelaysRef.current = [...recentDelaysRef.current.slice(-5), delay];
    setManualCode(text);

    if (autoSubmitTimer.current) clearTimeout(autoSubmitTimer.current);
    // Scanner HID: delays < 50ms → auto submit after 120ms idle
    const avgDelay = recentDelaysRef.current.reduce((a, b) => a + b, 0) / recentDelaysRef.current.length;
    if (avgDelay < 50 && text.length >= 4) {
      autoSubmitTimer.current = setTimeout(() => {
        processCode(text);
        recentDelaysRef.current = [];
      }, 120);
    }
  };

  const handleManualSubmit = () => {
    if (autoSubmitTimer.current) clearTimeout(autoSubmitTimer.current);
    if (manualCode.trim()) processCode(manualCode.trim());
  };

  const handleFinalize = () => {
    if (completed.length === 0) {
      Alert.alert('Sin escaneos', 'No has escaneado ninguna guía todavía.');
      return;
    }
    Alert.alert(
      mode === 'cargar_unidad' ? '✅ Finalizar Carga' : '✅ Finalizar Entrega',
      `${completed.length} guía(s) procesadas. ¿Confirmar y salir?`,
      [
        { text: 'Seguir escaneando', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: () => navigation.goBack(),
        },
      ]
    );
  };

  const modeLabel = mode === 'mostrador' ? 'Mostrador' : mode === 'recoleccion' ? 'Recolección' : 'Cargar Unidad';
  const statusColor = mode === 'cargar_unidad' ? '#2196F3' : '#4CAF50';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{carrierLabel(carrier)}</Text>
          <Text style={styles.subtitle}>{modeLabel} · {completed.length}/{initialPackages.length} listas</Text>
        </View>
        <TouchableOpacity onPress={() => setShowList(true)} style={styles.listBtn}>
          <MaterialIcons name="list" size={26} color={ORANGE} />
        </TouchableOpacity>
      </View>

      {/* Counter */}
      <View style={styles.counterSection}>
        <Text style={[styles.counterText, { color: statusColor }]}>
          {completed.length} / {initialPackages.length}
        </Text>
        <Text style={styles.counterLabel}>
          {mode === 'cargar_unidad' ? 'Cargados' : 'Enviados'}
        </Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, {
            width: `${initialPackages.length > 0 ? (completed.length / initialPackages.length) * 100 : 0}%`,
            backgroundColor: statusColor,
          }]} />
        </View>
      </View>

      {/* Scan phase indicator */}
      <View style={styles.phaseBox}>
        {mode !== 'cargar_unidad' && (
          <View style={styles.phaseRow}>
            <View style={[styles.phaseDot, scanPhase === 'internal' && styles.phaseDotActive]} />
            <Text style={[styles.phaseLabel, scanPhase === 'internal' && styles.phaseLabelActive]}>
              1. Guía interna (US-XXXX)
            </Text>
          </View>
        )}
        {mode !== 'cargar_unidad' && (
          <View style={[styles.phaseRow, { marginTop: 6 }]}>
            <View style={[styles.phaseDot, scanPhase === 'external' && styles.phaseDotActive]} />
            <Text style={[styles.phaseLabel, scanPhase === 'external' && styles.phaseLabelActive]}>
              2. Guía {carrierLabel(carrier)}
            </Text>
          </View>
        )}
        {mode === 'cargar_unidad' && (
          <Text style={[styles.phaseLabel, styles.phaseLabelActive]}>
            Escanea guía interna (US-XXXX)
          </Text>
        )}
        {scanPhase === 'external' && confirmedTracking ? (
          <View style={styles.confirmedBox}>
            <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
            <Text style={styles.confirmedText}>{confirmedTracking}</Text>
            <TouchableOpacity onPress={resetToInternal}>
              <MaterialIcons name="close" size={16} color="#999" />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {/* Scanner input */}
      <View style={styles.scannerBox}>
        <MaterialIcons
          name="qr-code-scanner"
          size={40}
          color={scanPhase === 'external' ? '#1976d2' : ORANGE}
        />
        <Text style={[styles.scanPrompt, { color: scanPhase === 'external' ? '#1976d2' : ORANGE }]}>
          {scanPhase === 'external'
            ? `Escanea guía de ${carrierLabel(carrier)}`
            : 'Escanea guía interna'}
        </Text>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={manualCode}
          onChangeText={handleTextChange}
          onSubmitEditing={handleManualSubmit}
          placeholder="Escanea o escribe el código"
          placeholderTextColor="#bbb"
          autoCapitalize="characters"
          returnKeyType="done"
          editable={!loading}
          blurOnSubmit={false}
        />
        <TouchableOpacity style={styles.validateBtn} onPress={handleManualSubmit} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <><MaterialIcons name="check-circle" size={20} color="#fff" />
               <Text style={styles.validateBtnText}>Validar</Text></>
          }
        </TouchableOpacity>
      </View>

      {/* Lista inline de ya cargados */}
      {completed.length > 0 && (
        <View style={{ marginHorizontal: 12, marginTop: 8, marginBottom: 80 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#666', marginBottom: 6 }}>
            ✅ YA PROCESADOS ({completed.length})
          </Text>
          <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
            {[...completed].reverse().map((c, i) => (
              <View key={c.packageId} style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: '#E8F5E9', borderRadius: 8, padding: 10, marginBottom: 4,
              }}>
                <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#2E7D32', fontFamily: 'monospace' }}>
                    {c.tracking}
                  </Text>
                  {c.externalTracking ? (
                    <Text style={{ fontSize: 11, color: '#666', fontFamily: 'monospace' }}>
                      → {c.externalTracking}
                    </Text>
                  ) : null}
                </View>
                <Text style={{ fontSize: 11, color: '#999' }}>#{completed.length - i}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Feedback */}
      {feedback && (
        <View style={[styles.feedbackBox, {
          backgroundColor: feedback.type === 'ok' ? '#E8F5E9' : feedback.type === 'warn' ? '#FFF8E1' : '#FFEBEE',
          borderColor: feedback.type === 'ok' ? '#4CAF50' : feedback.type === 'warn' ? '#FFC107' : '#F44336',
        }]}>
          <MaterialIcons
            name={feedback.type === 'ok' ? 'check-circle' : 'error'}
            size={18}
            color={feedback.type === 'ok' ? '#4CAF50' : feedback.type === 'warn' ? '#FFC107' : '#F44336'}
          />
          <Text style={[styles.feedbackText, {
            color: feedback.type === 'ok' ? '#2E7D32' : feedback.type === 'warn' ? '#F57F17' : '#C62828',
          }]}>{feedback.msg}</Text>
        </View>
      )}

      </ScrollView>

      {/* Finalizar — siempre visible (fuera del ScrollView) */}
      <TouchableOpacity style={styles.finalizeBtn} onPress={handleFinalize}>
        <MaterialIcons name="check" size={22} color="#fff" />
        <Text style={styles.finalizeBtnText}>Finalizar ({completed.length})</Text>
      </TouchableOpacity>

      {/* Modal lista de guías */}
      {showList && (
        <View style={styles.listModal}>
          <View style={styles.listModalContent}>
            <View style={styles.listModalHeader}>
              <Text style={styles.listModalTitle}>📦 Guías {carrierLabel(carrier)}</Text>
              <TouchableOpacity onPress={() => setShowList(false)}>
                <MaterialIcons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={initialPackages}
              keyExtractor={item => String(item.id)}
              renderItem={({ item }) => {
                const done = !!completed.find(c => c.packageId === item.id);
                return (
                  <View style={[styles.listItem, done && styles.listItemDone]}>
                    <MaterialIcons
                      name={done ? 'check-circle' : 'radio-button-unchecked'}
                      size={20}
                      color={done ? '#4CAF50' : '#ccc'}
                    />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.listItemTracking, done && { color: '#999' }]}>
                        {item.tracking_number}
                      </Text>
                      {done && completed.find(c => c.packageId === item.id)?.externalTracking && (
                        <Text style={styles.listItemExt}>
                          → {completed.find(c => c.packageId === item.id)?.externalTracking}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              }}
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  backBtn: { marginRight: 12 },
  listBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: '800', color: '#111' },
  subtitle: { fontSize: 12, color: '#666', marginTop: 1 },
  counterSection: { alignItems: 'center', paddingVertical: 20, backgroundColor: '#fff', marginTop: 1 },
  counterText: { fontSize: 48, fontWeight: '900' },
  counterLabel: { fontSize: 13, color: '#666', marginBottom: 8 },
  progressBar: { width: '80%', height: 6, backgroundColor: '#eee', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  phaseBox: { margin: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, elevation: 1 },
  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  phaseDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ddd' },
  phaseDotActive: { backgroundColor: ORANGE },
  phaseLabel: { fontSize: 14, color: '#999' },
  phaseLabelActive: { color: ORANGE, fontWeight: '700' },
  confirmedBox: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: '#E8F5E9', borderRadius: 8, padding: 8 },
  confirmedText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#2E7D32', fontFamily: 'monospace' },
  scannerBox: { margin: 12, backgroundColor: '#fff', borderRadius: 12, padding: 20, alignItems: 'center', elevation: 1 },
  scanPrompt: { fontSize: 15, fontWeight: '700', marginVertical: 10 },
  input: { width: '100%', borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 15, fontFamily: 'monospace', marginBottom: 10, backgroundColor: '#fafafa' },
  validateBtn: { width: '100%', backgroundColor: ORANGE, borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  validateBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  feedbackBox: { marginHorizontal: 12, borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1 },
  feedbackText: { flex: 1, fontSize: 13, fontWeight: '600' },
  finalizeBtn: { position: 'absolute', bottom: 24, left: 20, right: 20, backgroundColor: '#2E7D32', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, elevation: 4 },
  finalizeBtnText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  listModal: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  listModalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%' },
  listModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  listModalTitle: { fontSize: 16, fontWeight: '800' },
  listItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  listItemDone: { opacity: 0.7 },
  listItemTracking: { fontSize: 14, fontWeight: '700', fontFamily: 'monospace', color: ORANGE },
  listItemExt: { fontSize: 12, color: '#666', fontFamily: 'monospace', marginTop: 2 },
});
