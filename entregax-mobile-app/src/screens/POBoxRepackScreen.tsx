/**
 * POBoxRepackScreen - Reempaque (mirror de RepackPage web)
 *
 * Lista instrucciones de reempaque pendientes (paquetes US-REPACK-* con child_packages).
 * Botón abre wizard:
 *   1. Escanear las guías contenidas (auto-detecta master)
 *   2. Tomar foto del reempaque
 *   3. Confirmar → PATCH /api/packages/:id/status (status=reempacado)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  RefreshControl,
  ActivityIndicator,
  Image,
  Vibration,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#111';

interface ChildPackage {
  id: number;
  tracking_internal: string;
  weight: number;
  description: string;
  status: string;
}

interface RepackInstruction {
  id: number;
  tracking_internal: string;
  tracking_provider: string;
  description: string;
  weight: number;
  box_id: string;
  client_name: string;
  pkg_length: number;
  pkg_width: number;
  pkg_height: number;
  status: string;
  repack_tracking: string;
  created_at: string;
  child_packages: ChildPackage[];
  child_trackings: string;
}

interface ScannedPackage {
  id: number;
  tracking: string;
  weight: number;
  description: string;
}

const STEPS = ['Escanear', 'Foto', 'Confirmar'];

export default function POBoxRepackScreen({ route, navigation }: any) {
  const { token } = route.params;
  const insets = useSafeAreaInsets();
  const [instructions, setInstructions] = useState<RepackInstruction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Wizard
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [masterPackage, setMasterPackage] = useState<RepackInstruction | null>(null);
  const [scanInput, setScanInput] = useState('');
  const [scannedPackages, setScannedPackages] = useState<ScannedPackage[]>([]);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  // Camera
  const [scannerOpen, setScannerOpen] = useState(false);
  const [photoMode, setPhotoMode] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const scannerLockRef = useRef(false);
  const scanInputRef = useRef<TextInput | null>(null);

  const loadInstructions = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/packages/repack-instructions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setInstructions(data.instructions || []);
      } else {
        // Fallback
        const fb = await fetch(`${API_URL}/api/packages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (fb.ok) {
          const data = await fb.json();
          const repacks = (data.packages || []).filter(
            (p: any) =>
              p.tracking_internal?.startsWith('US-REPACK') &&
              ['received', 'pending_repack', 'quoted'].includes(p.status)
          );
          setInstructions(
            repacks.map((p: any) => ({
              id: p.id,
              tracking_internal: p.tracking_internal,
              tracking_provider: p.tracking_provider || '',
              description: p.description || '',
              weight: p.weight || 0,
              box_id: p.client?.boxId || p.box_id || '',
              client_name: p.client?.name || '',
              pkg_length: p.pkg_length || 0,
              pkg_width: p.pkg_width || 0,
              pkg_height: p.pkg_height || 0,
              status: p.status,
              repack_tracking: p.tracking_internal,
              created_at: p.created_at || '',
              child_packages: [],
              child_trackings: '',
            }))
          );
        }
      }
    } catch (err) {
      console.error('Error loading repack instructions:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    loadInstructions();
  }, [loadInstructions]);

  const onRefresh = () => {
    setRefreshing(true);
    loadInstructions();
  };

  const openWizard = () => {
    setStep(0);
    setMasterPackage(null);
    setScannedPackages([]);
    setPhotoUri(null);
    setScanInput('');
    setWizardOpen(true);
    setTimeout(() => scanInputRef.current?.focus(), 350);
    setTimeout(() => scanInputRef.current?.focus(), 700);
  };

  const closeWizard = () => {
    setWizardOpen(false);
    setStep(0);
    setMasterPackage(null);
    setScannedPackages([]);
    setPhotoUri(null);
    setScanInput('');
    setPhotoMode(false);
    setScannerOpen(false);
  };

  // ============ ESCANEO ============
  // Normaliza una guía para comparar: quita guiones/espacios y pasa a mayúsculas.
  // El lector de código de barras suele devolver la guía sin guion (US3985802484)
  // mientras que en BD se guarda con guion (US-3985802484).
  const normTracking = (s: string) => (s || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  const tryAddTracking = (raw: string) => {
    const tracking = raw.trim().toUpperCase();
    if (!tracking) return;
    const norm = normTracking(tracking);

    if (norm.startsWith('USREPACK')) {
      Alert.alert('❌ Guía incorrecta', 'Escanea las guías contenidas, no la guía de reempaque');
      Vibration.vibrate(150);
      return;
    }

    if (scannedPackages.some((p) => normTracking(p.tracking) === norm)) {
      Alert.alert('⚠️ Ya escaneado', `${tracking} ya fue agregado`);
      Vibration.vibrate(80);
      return;
    }

    let foundInstr: RepackInstruction | null = null;
    let foundChild: ChildPackage | undefined;
    for (const instr of instructions) {
      foundChild = instr.child_packages?.find((cp) => normTracking(cp.tracking_internal) === norm);
      if (foundChild) {
        foundInstr = instr;
        break;
      }
    }

    if (foundInstr && foundChild) {
      if (!masterPackage) {
        setMasterPackage(foundInstr);
        Alert.alert(
          '✅ Reempaque detectado',
          `${foundInstr.tracking_internal} para cliente ${foundInstr.box_id}`
        );
      } else if (foundInstr.id !== masterPackage.id) {
        Alert.alert(
          '❌ Reempaque diferente',
          `Esta guía pertenece a ${foundInstr.tracking_internal}, no a ${masterPackage.tracking_internal}`
        );
        Vibration.vibrate(150);
        return;
      }
      setScannedPackages((prev) => [
        ...prev,
        {
          id: foundChild!.id,
          tracking: foundChild!.tracking_internal,
          weight: Number(foundChild!.weight) || 0,
          description: foundChild!.description || '',
        },
      ]);
      Vibration.vibrate(40);
    } else {
      Alert.alert('❌ Guía no encontrada', `${tracking} no pertenece a ningún reempaque pendiente`);
      Vibration.vibrate(150);
    }
  };

  const handleManualSubmit = () => {
    if (!scanInput.trim()) return;
    tryAddTracking(scanInput);
    setScanInput('');
    setTimeout(() => scanInputRef.current?.focus(), 50);
  };

  const handleBarcodeScanned = ({ data }: BarcodeScanningResult) => {
    if (scannerLockRef.current) return;
    scannerLockRef.current = true;
    tryAddTracking(data);
    setTimeout(() => {
      scannerLockRef.current = false;
    }, 1200);
  };

  const openCameraScanner = async () => {
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a la cámara');
        return;
      }
    }
    setScannerOpen(true);
  };

  const removeScanned = (tracking: string) => {
    setScannedPackages((prev) => prev.filter((p) => p.tracking !== tracking));
  };

  // ============ FOTO ============
  const goToPhotoStep = () => {
    if (!masterPackage) {
      Alert.alert('Atención', 'Debes escanear al menos un paquete para detectar el reempaque');
      return;
    }
    const total = masterPackage.child_packages?.length || 0;
    if (total > 0 && scannedPackages.length < total) {
      Alert.alert(
        'Faltan paquetes',
        `Llevas ${scannedPackages.length}/${total} paquetes escaneados`
      );
      return;
    }
    setStep(1);
  };

  const openPhotoMode = async () => {
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a la cámara');
        return;
      }
    }
    setPhotoMode(true);
  };

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (photo?.uri) {
        setPhotoUri(photo.uri);
        setPhotoMode(false);
        setStep(2);
      }
    } catch (err) {
      Alert.alert('Error', 'No se pudo tomar la foto');
    }
  };

  // ============ FINALIZAR ============
  const finalizeRepack = async () => {
    if (!masterPackage || scannedPackages.length === 0) return;
    setProcessing(true);
    try {
      const res = await fetch(`${API_URL}/api/packages/${masterPackage.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: 'reempacado',
          notes: `Reempaque completado con ${scannedPackages.length} paquetes: ${scannedPackages
            .map((p) => p.tracking)
            .join(', ')}`,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al procesar reempaque');
      }
      Alert.alert(
        '✅ Reempaque completado',
        `${masterPackage.tracking_internal} marcado como reempacado con ${scannedPackages.length} paquetes`
      );
      closeWizard();
      loadInstructions();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo completar el reempaque');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Reempaque</Text>
          <Text style={styles.headerSubtitle}>Instrucciones pendientes</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} disabled={loading}>
          <Ionicons name="refresh" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
      >
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: '#FFF3EE' }]}>
            <Text style={[styles.statNumber, { color: ORANGE }]}>{instructions.length}</Text>
            <Text style={styles.statLabel}>Pendientes</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#E3F2FD' }]}>
            <Text style={[styles.statNumber, { color: '#1976D2' }]}>
              {instructions.reduce((s, i) => s + (i.child_packages?.length || 0), 0)}
            </Text>
            <Text style={styles.statLabel}>Paquetes hijo</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#E8F5E9' }]}>
            <Text style={[styles.statNumber, { color: '#2E7D32' }]}>
              {new Set(instructions.map((i) => i.box_id)).size}
            </Text>
            <Text style={styles.statLabel}>Clientes</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>📦 Reempaques pendientes</Text>
        {loading ? (
          <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 40 }} />
        ) : instructions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="albums-outline" size={48} color="#999" />
            <Text style={styles.emptyText}>No hay reempaques pendientes</Text>
          </View>
        ) : (
          instructions.map((instr) => (
            <View key={instr.id} style={styles.pkgCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pkgTracking}>{instr.tracking_internal}</Text>
                <Text style={styles.pkgClient}>
                  {instr.box_id} · {instr.client_name}
                </Text>
                <Text style={styles.pkgSubtext}>
                  {instr.child_packages?.length || 0} paquetes contenidos · {Number(instr.weight || 0).toFixed(2)} kg
                </Text>
                {instr.pkg_length && instr.pkg_width && instr.pkg_height ? (
                  <Text style={styles.pkgSubtext}>
                    {instr.pkg_length}×{instr.pkg_width}×{instr.pkg_height} cm
                  </Text>
                ) : null}
              </View>
              <View style={styles.pkgBadge}>
                <Ionicons name="albums" size={16} color={ORANGE} />
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={openWizard} activeOpacity={0.85}>
        <Ionicons name="qr-code-outline" size={20} color="#fff" />
        <Text style={styles.fabText}>Procesar Reempaque</Text>
      </TouchableOpacity>

      {/* Wizard Modal */}
      <Modal visible={wizardOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={closeWizard}>
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <View style={[styles.modalHeader, { paddingTop: Math.max(insets.top, 14) + 4 }]}>
            <TouchableOpacity onPress={closeWizard} style={styles.modalBackBtn} hitSlop={12}>
              <Ionicons name="chevron-back" size={24} color="#fff" />
              <Text style={styles.modalBackText}>Atrás</Text>
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.headerTitle}>Procesar Reempaque</Text>
              <Text style={styles.headerSubtitle}>Paso {step + 1} de 3 · {STEPS[step]}</Text>
            </View>
            <View style={{ width: 70 }} />
          </View>

          {/* Stepper */}
          <View style={styles.stepperRow}>
            {STEPS.map((label, idx) => (
              <View key={label} style={{ flex: 1, alignItems: 'center' }}>
                <View
                  style={[
                    styles.stepCircle,
                    idx === step && { backgroundColor: ORANGE },
                    idx < step && { backgroundColor: '#4CAF50' },
                  ]}
                >
                  <Text style={[styles.stepNum, (idx === step || idx < step) && { color: '#fff' }]}>
                    {idx < step ? '✓' : idx + 1}
                  </Text>
                </View>
                <Text style={[styles.stepLabel, idx === step && { color: ORANGE, fontWeight: '700' }]}>
                  {label}
                </Text>
              </View>
            ))}
          </View>

          {step === 0 && (
            <View style={{ flex: 1, padding: 16 }}>
              {masterPackage && (
                <View style={styles.masterCard}>
                  <Text style={styles.masterLabel}>Reempaque detectado</Text>
                  <Text style={styles.masterTracking}>{masterPackage.tracking_internal}</Text>
                  <Text style={styles.masterClient}>
                    {masterPackage.box_id} · {masterPackage.client_name}
                  </Text>
                  <Text style={styles.masterProgress}>
                    {scannedPackages.length} / {masterPackage.child_packages?.length || 0} paquetes
                  </Text>
                </View>
              )}

              <View style={styles.scanRow}>
                <TextInput
                  ref={scanInputRef}
                  style={styles.scanInput}
                  placeholder="Escribe o pega guía..."
                  placeholderTextColor="#999"
                  value={scanInput}
                  onChangeText={setScanInput}
                  onSubmitEditing={handleManualSubmit}
                  autoCapitalize="characters"
                  autoFocus
                  returnKeyType="done"
                  blurOnSubmit={false}
                />
                <TouchableOpacity style={styles.scanIconBtn} onPress={openCameraScanner}>
                  <Ionicons name="barcode-outline" size={22} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.scanIconBtn} onPress={handleManualSubmit}>
                  <Ionicons name="add" size={22} color="#fff" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ flex: 1, marginTop: 12 }}>
                {scannedPackages.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="qr-code-outline" size={48} color="#ccc" />
                    <Text style={styles.emptyText}>
                      Escanea la primera guía contenida{'\n'}para detectar el reempaque
                    </Text>
                  </View>
                ) : (
                  scannedPackages.map((p) => (
                    <View key={p.tracking} style={styles.scannedItem}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pkgTracking}>{p.tracking}</Text>
                        <Text style={styles.pkgSubtext}>
                          {p.weight.toFixed(2)} kg{p.description ? ` · ${p.description}` : ''}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => removeScanned(p.tracking)} hitSlop={10}>
                        <Ionicons name="trash-outline" size={20} color="#D32F2F" />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </ScrollView>

              <TouchableOpacity
                style={[styles.primaryBtn, !masterPackage && styles.btnDisabled]}
                disabled={!masterPackage}
                onPress={goToPhotoStep}
              >
                <Text style={styles.primaryBtnText}>Continuar a Foto</Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          {step === 1 && (
            <View style={{ flex: 1, padding: 16, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="camera-outline" size={64} color={ORANGE} />
              <Text style={styles.stepTitle}>Toma una foto del reempaque</Text>
              <Text style={styles.stepHelp}>
                La foto se asocia al master {masterPackage?.tracking_internal} para evidencia.
              </Text>
              <TouchableOpacity style={[styles.primaryBtn, { marginTop: 24, alignSelf: 'stretch' }]} onPress={openPhotoMode}>
                <Ionicons name="camera" size={20} color="#fff" />
                <Text style={styles.primaryBtnText}>Abrir Cámara</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryBtn, { marginTop: 10, alignSelf: 'stretch', alignItems: 'center' }]}
                onPress={() => setStep(2)}
              >
                <Text style={styles.secondaryBtnText}>Omitir foto</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 2 && masterPackage && (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
              <Text style={styles.stepTitle}>Confirmar Reempaque</Text>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Master</Text>
                <Text style={styles.summaryValue}>{masterPackage.tracking_internal}</Text>
                <Text style={styles.summaryLabel}>Cliente</Text>
                <Text style={styles.summaryValue}>
                  {masterPackage.box_id} · {masterPackage.client_name}
                </Text>
                <Text style={styles.summaryLabel}>Paquetes contenidos</Text>
                <Text style={styles.summaryValue}>{scannedPackages.length}</Text>
                <Text style={styles.summaryLabel}>Peso total</Text>
                <Text style={styles.summaryValue}>
                  {scannedPackages.reduce((s, p) => s + p.weight, 0).toFixed(2)} kg
                </Text>
              </View>

              {photoUri && (
                <View style={{ marginTop: 12, alignItems: 'center' }}>
                  <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                </View>
              )}

              <View style={{ marginTop: 16 }}>
                <Text style={styles.summaryLabel}>Guías contenidas:</Text>
                {scannedPackages.map((p) => (
                  <Text key={p.tracking} style={styles.bullet}>
                    • {p.tracking} ({p.weight.toFixed(2)} kg)
                  </Text>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, processing && styles.btnDisabled]}
                disabled={processing}
                onPress={finalizeRepack}
              >
                {processing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.primaryBtnText}>Finalizar Reempaque</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* Scanner cámara */}
      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'upc_a', 'upc_e'],
            }}
            onBarcodeScanned={handleBarcodeScanned}
          />
          <View style={styles.scannerOverlay}>
            <Text style={styles.scannerHint}>Apunta al código de barras / QR</Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: '#fff' }]}
              onPress={() => setScannerOpen(false)}
            >
              <Text style={[styles.primaryBtnText, { color: BLACK }]}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Foto cámara */}
      <Modal visible={photoMode} animationType="slide" onRequestClose={() => setPhotoMode(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView ref={(r) => { cameraRef.current = r; }} style={{ flex: 1 }} facing="back" />
          <View style={styles.scannerOverlay}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: '#fff', flex: 1 }]}
                onPress={() => setPhotoMode(false)}
              >
                <Text style={[styles.primaryBtnText, { color: BLACK }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={takePhoto}>
                <Ionicons name="camera" size={20} color="#fff" />
                <Text style={styles.primaryBtnText}>Capturar</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BLACK,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BLACK,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  modalBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
    width: 70,
  },
  modalBackText: { color: '#fff', fontSize: 15, fontWeight: '600', marginLeft: 2 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  headerSubtitle: { fontSize: 12, color: '#fff', opacity: 0.7 },
  statsRow: { flexDirection: 'row', padding: 12, gap: 10 },
  statCard: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
  statNumber: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, color: '#444', marginTop: 4, textAlign: 'center' },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: BLACK,
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  pkgCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: ORANGE,
    alignItems: 'center',
  },
  pkgTracking: { fontSize: 14, fontWeight: '700', color: ORANGE },
  pkgSubtext: { fontSize: 11, color: '#888', marginTop: 2 },
  pkgClient: { fontSize: 12, color: '#444', marginTop: 4 },
  pkgBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#FFF3EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 13, color: '#999', marginTop: 10, textAlign: 'center' },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    backgroundColor: ORANGE,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 30,
    gap: 8,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  fabText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  stepperRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stepNum: { fontSize: 13, fontWeight: '700', color: '#666' },
  stepLabel: { fontSize: 11, color: '#666' },
  stepTitle: { fontSize: 17, fontWeight: '800', color: BLACK, marginTop: 14, textAlign: 'center' },
  stepHelp: { fontSize: 13, color: '#666', textAlign: 'center', marginTop: 6 },

  masterCard: {
    backgroundColor: '#FFF3EE',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: ORANGE,
    marginBottom: 12,
  },
  masterLabel: { fontSize: 10, fontWeight: '700', color: ORANGE, textTransform: 'uppercase' },
  masterTracking: { fontSize: 16, fontWeight: '800', color: BLACK, marginTop: 2 },
  masterClient: { fontSize: 12, color: '#666', marginTop: 4 },
  masterProgress: { fontSize: 13, fontWeight: '700', color: ORANGE, marginTop: 6 },

  scanRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  scanInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    color: BLACK,
  },
  scanIconBtn: {
    backgroundColor: ORANGE,
    width: 46,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannedItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  primaryBtn: {
    backgroundColor: ORANGE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 10,
    gap: 8,
    marginTop: 12,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnDisabled: { opacity: 0.4 },
  secondaryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CCC',
  },
  secondaryBtnText: { color: '#666', fontWeight: '700' },

  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  summaryLabel: { fontSize: 11, color: '#999', textTransform: 'uppercase', marginTop: 8 },
  summaryValue: { fontSize: 14, fontWeight: '700', color: BLACK, marginTop: 2 },
  bullet: { fontSize: 13, color: '#444', marginTop: 4 },
  photoPreview: { width: 220, height: 220, borderRadius: 12 },

  scannerOverlay: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    alignItems: 'center',
    gap: 14,
  },
  scannerHint: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
});
