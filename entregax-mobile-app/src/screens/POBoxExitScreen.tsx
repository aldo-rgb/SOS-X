/**
 * POBoxExitScreen - Control de Salidas (Outbound Control)
 *
 * Espejo móvil de OutboundControlPage (web):
 * - Lista paquetes US listos para salida
 * - Stats: paquetes listos, peso total, clientes únicos
 * - Botón "Nueva Salida" abre wizard de escaneo + selección de proveedor
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
  FlatList,
  Vibration,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#111';

interface Package {
  id: number;
  tracking_internal: string;
  tracking_provider?: string;
  description?: string;
  weight?: number;
  box_id: string;
  client_name?: string;
  total_boxes?: number;
  status: string;
}

interface Supplier {
  id: number;
  name: string;
  active: boolean;
}

interface ScannedPackage {
  id: number;
  tracking: string;
  weight: number;
  boxId: string;
  description: string;
}

export default function POBoxExitScreen({ route, navigation }: any) {
  const { token } = route.params;
  const insets = useSafeAreaInsets();
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [scannedPackages, setScannedPackages] = useState<ScannedPackage[]>([]);
  const [processing, setProcessing] = useState(false);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scannerLockRef = useRef(false);
  const scanInputRef = useRef<TextInput | null>(null);

  const loadPackages = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/packages/outbound-ready`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPackages(data.packages || []);
      } else {
        const fallback = await fetch(`${API_URL}/api/packages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (fallback.ok) {
          const data = await fallback.json();
          const usPackages = (data.packages || []).filter(
            (p: any) =>
              p.tracking_internal?.startsWith('US-') &&
              !p.tracking_internal?.startsWith('US-REPACK-') &&
              p.status === 'in_transit'
          );
          setPackages(usPackages);
        }
      }
    } catch (err) {
      console.error('Error loading outbound packages:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  const loadSuppliers = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/suppliers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSuppliers((data.suppliers || []).filter((s: Supplier) => s.active));
      }
    } catch (err) {
      console.error('Error loading suppliers:', err);
    }
  }, [token]);

  useEffect(() => {
    loadPackages();
    loadSuppliers();
  }, [loadPackages, loadSuppliers]);

  const onRefresh = () => {
    setRefreshing(true);
    loadPackages();
  };

  const totalWeight = packages.reduce((s, p) => s + (Number(p.weight) || 0), 0);
  const uniqueClients = new Set(packages.map((p) => p.box_id)).size;

  const openWizard = () => {
    setScannedPackages([]);
    setScanInput('');
    setWizardOpen(true);
    // Auto-focus el input para que aparezca el teclado de inmediato
    setTimeout(() => scanInputRef.current?.focus(), 350);
    setTimeout(() => scanInputRef.current?.focus(), 700);
  };

  const closeWizard = () => {
    setWizardOpen(false);
    setScannedPackages([]);
    setScanInput('');
  };

  const normalizeTracking = (raw: string): string => {
    let t = raw.trim().toUpperCase();
    const urlMatch = t.match(/(?:\/TRACK\/|\/T\/)([A-Z0-9-]+)/i);
    if (urlMatch && urlMatch[1]) t = urlMatch[1];
    const noDash = t.match(/^(US|MX|CN|DHL|FDX|UPS)(\d{6,})$/);
    if (noDash) t = `${noDash[1]}-${noDash[2]}`;
    return t;
  };

  const stripDash = (s?: string | null) => (s || '').toUpperCase().replace(/-/g, '');

  const tryAddTracking = (raw: string) => {
    const tracking = normalizeTracking(raw);
    if (!tracking) return;

    if (scannedPackages.some((p) => p.tracking === tracking)) {
      Alert.alert('⚠️ Ya escaneado', `La guía ${tracking} ya fue agregada`);
      Vibration.vibrate(80);
      return;
    }

    const trackingNoDash = stripDash(tracking);
    const pkg = packages.find(
      (p) =>
        p.tracking_internal?.toUpperCase() === tracking ||
        p.tracking_provider?.toUpperCase() === tracking ||
        stripDash(p.tracking_internal) === trackingNoDash ||
        stripDash(p.tracking_provider) === trackingNoDash
    );

    if (pkg) {
      setScannedPackages((prev) => [
        ...prev,
        {
          id: pkg.id,
          tracking: pkg.tracking_internal,
          weight: Number(pkg.weight) || 0,
          boxId: pkg.box_id,
          description: pkg.description || '',
        },
      ]);
      Vibration.vibrate(40);
    } else {
      Alert.alert(
        '❌ Guía no encontrada',
        `${tracking} no está lista para salida.\n\nPodría ser parte de un reempaque o no estar en estado 'in_transit'.`
      );
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
        Alert.alert('Permiso requerido', 'Necesitamos acceso a la cámara para escanear.');
        return;
      }
    }
    setScannerOpen(true);
  };

  const removeScanned = (tracking: string) => {
    setScannedPackages((prev) => prev.filter((p) => p.tracking !== tracking));
  };

  const handleProceedToSupplier = () => {
    if (scannedPackages.length === 0) {
      Alert.alert('Atención', 'Escanea al menos una guía');
      return;
    }
    setSelectedSupplierId(null);
    setSupplierModalOpen(true);
  };

  const createOutbound = async () => {
    if (!selectedSupplierId) {
      Alert.alert('Atención', 'Selecciona un proveedor de salida');
      return;
    }
    setProcessing(true);
    try {
      const totalW = scannedPackages.reduce((s, p) => s + (Number(p.weight) || 0), 0);
      const res = await fetch(`${API_URL}/api/packages/create-outbound`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          packageIds: scannedPackages.map((p) => p.id),
          totalWeight: totalW,
          supplierId: selectedSupplierId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al crear consolidación');
      }
      const data = await res.json();
      const consolidationId = data.consolidationId || data.id;
      const supplierName = suppliers.find((s) => s.id === selectedSupplierId)?.name || 'Proveedor';
      Alert.alert(
        '✅ Salida creada',
        `Consolidación #${consolidationId} - ${scannedPackages.length} guías asignadas a ${supplierName}`
      );
      setSupplierModalOpen(false);
      closeWizard();
      loadPackages();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo crear la consolidación');
    } finally {
      setProcessing(false);
    }
  };

  const totalScannedWeight = scannedPackages.reduce((s, p) => s + (Number(p.weight) || 0), 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Control de Salidas</Text>
          <Text style={styles.headerSubtitle}>Paquetes US listos para salida</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} disabled={loading}>
          <Ionicons name="refresh" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
      >
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: '#FFF3EE' }]}>
            <Text style={[styles.statNumber, { color: ORANGE }]}>{packages.length}</Text>
            <Text style={styles.statLabel}>Paquetes Listos</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#E3F2FD' }]}>
            <Text style={[styles.statNumber, { color: '#1976D2' }]}>{totalWeight.toFixed(1)} kg</Text>
            <Text style={styles.statLabel}>Peso Total</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#E8F5E9' }]}>
            <Text style={[styles.statNumber, { color: '#2E7D32' }]}>{uniqueClients}</Text>
            <Text style={styles.statLabel}>Clientes</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>📋 Paquetes en bodega ({packages.length})</Text>
        {loading ? (
          <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 40 }} />
        ) : packages.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={48} color="#999" />
            <Text style={styles.emptyText}>No hay paquetes listos para salida</Text>
          </View>
        ) : (
          packages.map((pkg) => (
            <View key={pkg.id} style={styles.pkgCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pkgTracking}>{pkg.tracking_internal}</Text>
                {pkg.tracking_provider ? (
                  <Text style={styles.pkgSubtext}>{pkg.tracking_provider}</Text>
                ) : null}
                <Text style={styles.pkgClient}>
                  {pkg.box_id} {pkg.description ? `· ${pkg.description}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                {pkg.total_boxes && pkg.total_boxes > 1 ? (
                  <View style={styles.boxBadge}>
                    <Ionicons name="cube" size={12} color="#666" />
                    <Text style={styles.boxBadgeText}>{pkg.total_boxes}</Text>
                  </View>
                ) : null}
                <Text style={styles.pkgWeight}>{Number(pkg.weight || 0).toFixed(2)} kg</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={openWizard} activeOpacity={0.85}>
        <Ionicons name="qr-code-outline" size={20} color="#fff" />
        <Text style={styles.fabText}>Nueva Salida</Text>
      </TouchableOpacity>

      <Modal visible={wizardOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={closeWizard}>
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <View style={[styles.modalHeader, { paddingTop: Math.max(insets.top, 14) + 4 }]}>
            <TouchableOpacity onPress={closeWizard} style={styles.modalBackBtn} hitSlop={12}>
              <Ionicons name="chevron-back" size={24} color="#fff" />
              <Text style={styles.modalBackText}>Atrás</Text>
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.headerTitle}>Nueva Salida</Text>
              <Text style={styles.headerSubtitle}>Escanea las guías al cargar</Text>
            </View>
            <View style={{ width: 70 }} />
          </View>

          <View style={{ flex: 1, padding: 16 }}>
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

            <View style={styles.scanSummary}>
              <Text style={styles.scanSummaryText}>
                <Text style={{ fontWeight: '800', color: ORANGE }}>{scannedPackages.length}</Text>
                {' '}guías escaneadas · {totalScannedWeight.toFixed(2)} kg
              </Text>
            </View>

            <FlatList
              data={scannedPackages}
              keyExtractor={(it) => it.tracking}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons name="qr-code-outline" size={48} color="#ccc" />
                  <Text style={styles.emptyText}>Escanea la primera guía para comenzar</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.scannedItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pkgTracking}>{item.tracking}</Text>
                    <Text style={styles.pkgSubtext}>
                      {item.boxId} · {item.weight.toFixed(2)} kg
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => removeScanned(item.tracking)} hitSlop={10}>
                    <Ionicons name="trash-outline" size={20} color="#D32F2F" />
                  </TouchableOpacity>
                </View>
              )}
              style={{ flex: 1, marginTop: 12 }}
            />

            <TouchableOpacity
              style={[styles.primaryBtn, scannedPackages.length === 0 && styles.btnDisabled]}
              disabled={scannedPackages.length === 0}
              onPress={handleProceedToSupplier}
            >
              <Text style={styles.primaryBtnText}>
                Crear Consolidación ({scannedPackages.length})
              </Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={supplierModalOpen} animationType="fade" transparent onRequestClose={() => setSupplierModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Seleccionar Proveedor</Text>
            <Text style={styles.modalSubtitle}>¿Qué proveedor llevará esta consolidación?</Text>

            <ScrollView style={{ maxHeight: 320, marginTop: 12 }}>
              {suppliers.length === 0 ? (
                <Text style={styles.emptyText}>No hay proveedores activos</Text>
              ) : (
                suppliers.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[
                      styles.supplierRow,
                      selectedSupplierId === s.id && styles.supplierRowSelected,
                    ]}
                    onPress={() => setSelectedSupplierId(s.id)}
                  >
                    <Ionicons
                      name={selectedSupplierId === s.id ? 'radio-button-on' : 'radio-button-off'}
                      size={22}
                      color={selectedSupplierId === s.id ? ORANGE : '#999'}
                    />
                    <Text style={styles.supplierName}>{s.name}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => setSupplierModalOpen(false)}
                disabled={processing}
              >
                <Text style={styles.secondaryBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { flex: 1 }, !selectedSupplierId && styles.btnDisabled]}
                onPress={createOutbound}
                disabled={!selectedSupplierId || processing}
              >
                {processing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Confirmar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
  scroll: { flex: 1 },
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
  },
  pkgTracking: { fontSize: 14, fontWeight: '700', color: ORANGE },
  pkgSubtext: { fontSize: 11, color: '#888', marginTop: 2 },
  pkgClient: { fontSize: 12, color: '#444', marginTop: 4 },
  pkgWeight: { fontSize: 13, fontWeight: '700', color: BLACK, marginTop: 4 },
  boxBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 3,
  },
  boxBadgeText: { fontSize: 11, color: '#666', fontWeight: '600' },
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
  scanSummary: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
    alignItems: 'center',
  },
  scanSummaryText: { fontSize: 13, color: '#444' },
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

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: { backgroundColor: '#fff', borderRadius: 14, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: BLACK },
  modalSubtitle: { fontSize: 13, color: '#666', marginTop: 4 },
  supplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 8,
  },
  supplierRowSelected: { borderColor: ORANGE, backgroundColor: '#FFF3EE' },
  supplierName: { fontSize: 14, color: BLACK, fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  secondaryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CCC',
  },
  secondaryBtnText: { color: '#666', fontWeight: '700' },

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
