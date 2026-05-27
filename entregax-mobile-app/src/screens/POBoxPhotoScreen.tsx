/**
 * POBoxPhotoScreen — Agregar fotos a guías sin fotografía
 *
 * Flujo por guía:
 *   1. Lista de paquetes sin foto  →  2. Escanear guía interna  →  3. Tomar foto  →  4. Guardar
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Image,
  RefreshControl,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#111';

interface PkgItem {
  id: number;
  tracking: string;
  trackingProvider?: string;
  imageUrl?: string | null;
  client?: { name?: string; boxId?: string } | null;
  receivedAt?: string;
  totalBoxes?: number;
  isMaster?: boolean;
}

type Phase = 'list' | 'scanning' | 'preview';

export default function POBoxPhotoScreen({ route, navigation }: any) {
  const { user, token } = route.params;

  const [packages, setPackages] = useState<PkgItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Flujo activo
  const [phase, setPhase] = useState<Phase>('list');
  const [activePkg, setActivePkg] = useState<PkgItem | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Scanner
  const [scannerReady, setScannerReady] = useState(true);
  const [manualInput, setManualInput] = useState('');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const manualRef = useRef<TextInput>(null);

  // ─── Carga ────────────────────────────────────────────────────────────────

  const fetchPackages = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/packages?limit=300`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Error al cargar paquetes');
      const data = await res.json();
      const all: PkgItem[] = data.packages || [];
      setPackages(all.filter((p) => !p.imageUrl));
    } catch (e) {
      Alert.alert('Error', 'No se pudieron cargar los paquetes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { fetchPackages(); }, [fetchPackages]);

  const onRefresh = () => { setRefreshing(true); fetchPackages(); };

  // ─── Iniciar flujo ────────────────────────────────────────────────────────

  const startFlow = async (pkg: PkgItem) => {
    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission();
      if (!granted) {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a la cámara para escanear y fotografiar');
        return;
      }
    }
    setActivePkg(pkg);
    setManualInput('');
    setScannerReady(true);
    setPhase('scanning');
  };

  // ─── Scanner ──────────────────────────────────────────────────────────────

  const handleBarCodeScanned = (result: BarcodeScanningResult) => {
    if (!scannerReady || !activePkg) return;
    setScannerReady(false);

    const scanned = result.data.trim().toUpperCase();
    const expected = (activePkg.tracking || '').trim().toUpperCase();
    const expectedProvider = (activePkg.trackingProvider || '').trim().toUpperCase();

    if (scanned === expected || scanned === expectedProvider || expected.includes(scanned) || scanned.includes(expected)) {
      launchCamera();
    } else {
      Alert.alert(
        '⚠️ Guía no coincide',
        `Escaneaste: ${scanned}\nEsperado: ${expected}\n\n¿Continuar de todas formas?`,
        [
          { text: 'Cancelar', onPress: () => setTimeout(() => setScannerReady(true), 800) },
          { text: 'Continuar', onPress: launchCamera },
        ]
      );
    }
  };

  const handleManualConfirm = () => {
    const typed = manualInput.trim().toUpperCase();
    if (!typed || !activePkg) return;
    const expected = (activePkg.tracking || '').trim().toUpperCase();
    const expectedProvider = (activePkg.trackingProvider || '').trim().toUpperCase();

    if (typed === expected || typed === expectedProvider || expected.includes(typed) || typed.includes(expected)) {
      launchCamera();
    } else {
      Alert.alert(
        '⚠️ Guía no coincide',
        `Ingresaste: ${typed}\nEsperado: ${expected}\n\n¿Continuar de todas formas?`,
        [
          { text: 'Cancelar' },
          { text: 'Continuar', onPress: launchCamera },
        ]
      );
    }
  };

  // ─── Cámara ───────────────────────────────────────────────────────────────

  const launchCamera = async () => {
    setPhase('list'); // oculta scanner modal antes de abrir cámara
    await new Promise((r) => setTimeout(r, 200));
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Se necesita acceso a la cámara');
      resetFlow();
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.75,
    });
    if (result.canceled || !result.assets?.[0]) {
      resetFlow();
      return;
    }
    setPhotoUri(result.assets[0].uri);
    setPhase('preview');
  };

  // ─── Upload ───────────────────────────────────────────────────────────────

  const uploadPhoto = async () => {
    if (!activePkg || !photoUri) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('photo', {
        uri: photoUri,
        name: `photo_${activePkg.id}_${Date.now()}.jpg`,
        type: 'image/jpeg',
      } as any);

      const res = await fetch(`${API_URL}/api/packages/${activePkg.id}/reception-photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      if (!res.ok) throw new Error('Error al guardar');

      // Quitar de la lista
      setPackages((prev) => prev.filter((p) => p.id !== activePkg.id));
      resetFlow();
    } catch {
      Alert.alert('Error', 'No se pudo guardar la foto. Intenta de nuevo.');
    } finally {
      setUploading(false);
    }
  };

  const resetFlow = () => {
    setPhase('list');
    setActivePkg(null);
    setPhotoUri(null);
    setScannerReady(true);
    setManualInput('');
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const renderItem = ({ item }: { item: PkgItem }) => (
    <TouchableOpacity style={styles.card} onPress={() => startFlow(item)} activeOpacity={0.75}>
      <View style={styles.cardLeft}>
        <View style={styles.noPhotoIcon}>
          <Ionicons name="image-outline" size={22} color="#bbb" />
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTracking}>{item.tracking}</Text>
        {item.trackingProvider ? (
          <Text style={styles.cardSub}>{item.trackingProvider}</Text>
        ) : null}
        <Text style={styles.cardClient}>
          {item.client?.name || 'Sin cliente'}
          {item.client?.boxId ? ` · ${item.client.boxId}` : ''}
        </Text>
        {item.isMaster && (item.totalBoxes || 0) > 1 && (
          <Text style={styles.cardMulti}>📦 {item.totalBoxes} cajas</Text>
        )}
      </View>
      <Ionicons name="camera-outline" size={24} color={ORANGE} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Agregar Fotos</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{packages.length} sin foto</Text>
        </View>
      </View>

      {/* Lista */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ORANGE} />
          <Text style={styles.loadingText}>Cargando guías sin foto...</Text>
        </View>
      ) : (
        <FlatList
          data={packages}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={packages.length === 0 ? styles.center : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle-outline" size={64} color="#4caf50" />
              <Text style={styles.emptyTitle}>¡Todo al día!</Text>
              <Text style={styles.emptySubtitle}>Todas las guías tienen fotografía.</Text>
            </View>
          }
        />
      )}

      {/* ── SCANNER MODAL ── */}
      <Modal visible={phase === 'scanning'} animationType="slide" onRequestClose={resetFlow}>
        <View style={styles.scannerContainer}>
          {/* Top bar */}
          <View style={styles.scannerHeader}>
            <TouchableOpacity onPress={resetFlow} style={styles.scannerClose}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.scannerTitle}>Escanear Guía</Text>
              {activePkg && (
                <Text style={styles.scannerSub} numberOfLines={1}>
                  Esperando: {activePkg.tracking}
                </Text>
              )}
            </View>
          </View>

          {/* Camera */}
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['code128', 'code39', 'qr', 'ean13', 'ean8', 'aztec', 'pdf417'] }}
            onBarcodeScanned={scannerReady ? handleBarCodeScanned : undefined}
          />

          {/* Overlay frame */}
          <View style={styles.scanOverlay} pointerEvents="none">
            <View style={styles.scanFrame} />
            <Text style={styles.scanHint}>Apunta al código de barras de la guía</Text>
          </View>

          {/* Manual input */}
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.manualContainer}
          >
            <Text style={styles.manualLabel}>O ingresa manualmente:</Text>
            <View style={styles.manualRow}>
              <TextInput
                ref={manualRef}
                style={styles.manualInput}
                value={manualInput}
                onChangeText={setManualInput}
                placeholder="US-XXXXXXXXXX"
                placeholderTextColor="#999"
                autoCapitalize="characters"
                returnKeyType="done"
                onSubmitEditing={handleManualConfirm}
              />
              <TouchableOpacity style={styles.manualBtn} onPress={handleManualConfirm}>
                <Ionicons name="arrow-forward" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.skipBtn} onPress={launchCamera}>
              <Text style={styles.skipText}>Saltar escaneo — ir directo a foto</Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── PREVIEW MODAL ── */}
      <Modal visible={phase === 'preview'} animationType="slide" onRequestClose={resetFlow}>
        <SafeAreaView style={styles.previewContainer} edges={['top', 'bottom']}>
          <View style={styles.previewHeader}>
            <TouchableOpacity onPress={resetFlow} style={styles.scannerClose}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.scannerTitle}>Confirmar Foto</Text>
          </View>

          {photoUri && (
            <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="contain" />
          )}

          <View style={styles.previewInfo}>
            <Text style={styles.previewTracking}>{activePkg?.tracking}</Text>
            <Text style={styles.previewClient}>
              {activePkg?.client?.name || 'Sin cliente'}
              {activePkg?.client?.boxId ? ` · ${activePkg.client.boxId}` : ''}
            </Text>
          </View>

          <View style={styles.previewActions}>
            <TouchableOpacity style={styles.retakeBtn} onPress={launchCamera} disabled={uploading}>
              <Ionicons name="camera-reverse-outline" size={20} color={ORANGE} />
              <Text style={styles.retakeText}>Repetir</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={uploadPhoto} disabled={uploading}>
              {uploading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />}
              <Text style={styles.saveText}>{uploading ? 'Guardando...' : 'Guardar'}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BLACK,
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 10,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#fff' },
  badge: { backgroundColor: '#e91e63', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // List
  list: { padding: 12, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  loadingText: { marginTop: 12, color: '#666', fontSize: 14 },
  emptyState: { alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: '#888', marginTop: 6 },

  // Card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardLeft: { marginRight: 12 },
  noPhotoIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1 },
  cardTracking: { fontSize: 15, fontWeight: '700', color: ORANGE },
  cardSub: { fontSize: 11, color: '#888', marginTop: 1 },
  cardClient: { fontSize: 12, color: '#555', marginTop: 3 },
  cardMulti: { fontSize: 11, color: '#1976d2', marginTop: 2 },

  // Scanner
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingTop: 54,
    paddingBottom: 16,
    paddingHorizontal: 16,
    gap: 12,
    zIndex: 10,
  },
  scannerClose: { padding: 4 },
  scannerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  scannerSub: { fontSize: 12, color: '#ccc', marginTop: 2 },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 260,
    height: 120,
    borderWidth: 2.5,
    borderColor: ORANGE,
    borderRadius: 10,
    backgroundColor: 'transparent',
    marginTop: 40,
  },
  scanHint: {
    color: '#fff',
    fontSize: 13,
    marginTop: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  manualContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.88)',
    padding: 20,
    paddingBottom: 36,
  },
  manualLabel: { color: '#aaa', fontSize: 12, marginBottom: 8 },
  manualRow: { flexDirection: 'row', gap: 10 },
  manualInput: {
    flex: 1,
    backgroundColor: '#222',
    color: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#444',
  },
  manualBtn: {
    backgroundColor: ORANGE,
    borderRadius: 10,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtn: { marginTop: 14, alignItems: 'center' },
  skipText: { color: '#aaa', fontSize: 13, textDecorationLine: 'underline' },

  // Preview
  previewContainer: { flex: 1, backgroundColor: '#000' },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.9)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  photoPreview: { flex: 1, width: '100%' },
  previewInfo: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    padding: 16,
  },
  previewTracking: { fontSize: 16, fontWeight: '700', color: ORANGE },
  previewClient: { fontSize: 13, color: '#ccc', marginTop: 4 },
  previewActions: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 32,
    gap: 12,
    backgroundColor: '#111',
  },
  retakeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: ORANGE,
  },
  retakeText: { fontSize: 15, fontWeight: '700', color: ORANGE },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4caf50',
  },
  saveText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
