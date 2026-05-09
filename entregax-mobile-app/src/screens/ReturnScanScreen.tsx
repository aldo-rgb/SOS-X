/**
 * ReturnScanScreen - Escaneo de Retorno a Bodega
 * 
 * Funcionalidad:
 * - Lista paquetes que el chofer tiene como "out_for_delivery"
 * - Permite escanear los que NO se entregaron
 * - Selección de motivo de retorno
 * - Devuelve los paquetes al inventario del CEDIS
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Vibration,
  Animated,
  Modal,
  FlatList,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { createAudioPlayer } from 'expo-audio';
import api from '../services/api';

// Sonidos pre-cargados
const successPlayer = createAudioPlayer(require('../../assets/sounds/success.wav'));
const errorPlayer = createAudioPlayer(require('../../assets/sounds/error.wav'));
const playSuccess = () => { try { successPlayer.seekTo(0); successPlayer.play(); } catch {} };
const playError = () => { try { errorPlayer.seekTo(0); errorPlayer.play(); } catch {} };

interface PackageToReturn {
  id: number;
  tracking_number: string;
  delivery_address: string;
  delivery_city: string;
  recipient_name: string;
  loaded_at: string;
}

interface ReturnReason {
  value: string;
  label: string;
  icon: string;
}

const RETURN_REASONS: ReturnReason[] = [
  { value: 'client_not_home', label: 'Cliente no estaba', icon: 'person-off' },
  { value: 'wrong_address', label: 'Dirección incorrecta', icon: 'location-off' },
  { value: 'client_refused', label: 'Cliente rechazó', icon: 'do-not-disturb' },
  { value: 'damaged_package', label: 'Paquete dañado', icon: 'broken-image' },
  { value: 'reschedule_requested', label: 'Reprogramación solicitada', icon: 'schedule' },
  { value: 'access_denied', label: 'No se pudo acceder', icon: 'lock' },
  { value: 'other', label: 'Otro motivo', icon: 'help-outline' },
];

interface FeedbackMessage {
  type: 'success' | 'error' | 'warning';
  message: string;
}

type ScanMode = 'camera' | 'scanner';

const normalizeScanCode = (rawCode: string): string => {
  if (!rawCode) return '';

  let code = String(rawCode)
    .replace(/[\r\n\t]/g, '')
    .trim();

  try {
    code = decodeURIComponent(code);
  } catch {
    // ignore decode errors
  }

  const fromTrackPath = code.match(/\/track\/([^/?#\s]+)/i);
  if (fromTrackPath?.[1]) {
    code = fromTrackPath[1];
  }

  const fromQuery = code.match(/[?&](?:track|tracking|barcode|code)=([^&#\s]+)/i);
  if (fromQuery?.[1]) {
    code = fromQuery[1];
  }

  code = code
    .replace(/[_'`,’‘]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/\s+/g, '')
    .toUpperCase();

  const canonicalTracking = code.match(/[A-Z]{2,}-[A-Z0-9]{2,}(?:-[A-Z0-9]{2,})*/);
  if (canonicalTracking?.[0]) {
    return canonicalTracking[0];
  }

  // Servicios con prefijo de 3 letras: distinguir master vs master+child por longitud.
  if (code.startsWith('LOG')) {
    const log4 = code.match(/^(LOG[A-Z0-9]{11,})(\d{4})$/);
    if (log4 && code.length >= 18) return `${log4[1]}-${log4[2]}`;
    const log2 = code.match(/^(LOG[A-Z0-9]{11,})(\d{2})$/);
    if (log2 && code.length >= 16) return `${log2[1]}-${log2[2]}`;
    return code;
  }
  if (code.startsWith('AIR')) {
    const air3 = code.match(/^(AIR[A-Z0-9]+?[A-Z])(\d{3})$/);
    if (air3 && code.length >= 17) return `${air3[1]}-${air3[2]}`;
    return code;
  }
  if (code.startsWith('DHL')) {
    const dhl = code.match(/^(DHL[A-Z0-9]+?[A-Z])(\d{2,4})$/);
    if (dhl && code.length >= 14) return `${dhl[1]}-${dhl[2]}`;
    return code;
  }

  const compactTracking = code.match(/[A-Z]{2,}[A-Z0-9]{4,}/);
  if (compactTracking?.[0]) {
    const compact = compactTracking[0];
    return `${compact.slice(0, 2)}-${compact.slice(2)}`;
  }

  return code;
};

export default function ReturnScanScreen({ navigation, route }: any) {
  const token = route?.params?.token;
  const initialScanMode: ScanMode = route?.params?.scanMode === 'scanner' ? 'scanner' : 'camera';

  const [loading, setLoading] = useState(true);
  const [packagesToReturn, setPackagesToReturn] = useState<PackageToReturn[]>([]);
  const [returnedCount, setReturnedCount] = useState(0);
  const [totalToReturn, setTotalToReturn] = useState(0);
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scannerActive, setScannerActive] = useState(true);
  const [lastScannedCode, setLastScannedCode] = useState<string>('');
  const [scanMode, setScanMode] = useState<ScanMode>(initialScanMode);
  const [manualCode, setManualCode] = useState('');
  
  // Modal de selección de motivo
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [pendingBarcode, setPendingBarcode] = useState<string>('');
  const [selectedReason, setSelectedReason] = useState<string>('client_not_home');
  
  const [permission, requestPermission] = useCameraPermissions();
  
  // Animaciones
  const feedbackOpacity = useRef(new Animated.Value(0)).current;
  const hasAskedModeRef = useRef(false);
  const manualInputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    loadPackagesToReturn();

    if (!route?.params?.scanMode && !hasAskedModeRef.current) {
      hasAskedModeRef.current = true;
      Alert.alert(
        'Selecciona método de captura',
        '¿Deseas usar escáner o cámara?',
        [
          { text: 'Escáner', onPress: () => setScanMode('scanner') },
          { text: 'Cámara', onPress: () => setScanMode('camera') },
        ]
      );
    }
  }, []);

  useEffect(() => {
    if (scanMode === 'scanner') {
      setScannerActive(false);
      setTimeout(() => manualInputRef.current?.focus(), 150);
    } else {
      setScannerActive(true);
    }
  }, [scanMode]);

  const loadPackagesToReturn = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/driver/packages-to-return', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.data.success) {
        setPackagesToReturn(res.data.packages);
        setTotalToReturn(res.data.totalToReturn);
      }
    } catch (error) {
      console.error('Error cargando paquetes:', error);
      Alert.alert('Error', 'No se pudieron cargar los paquetes pendientes');
    } finally {
      setLoading(false);
    }
  };

  const showFeedback = (fb: FeedbackMessage) => {
    if (fb.type === 'success') playSuccess(); else playError();
    setFeedback(fb);
    Animated.sequence([
      Animated.timing(feedbackOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(2500),
      Animated.timing(feedbackOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setFeedback(null));
  };

  const processScanCode = useCallback(async (rawCode: string, source: 'camera' | 'scanner' = 'camera') => {
    const data = normalizeScanCode(rawCode);
    if (!data || isScanning) return;
    if (source === 'camera' && (!scannerActive || data === lastScannedCode)) return;

    setIsScanning(true);
    if (source === 'camera') setScannerActive(false);
    setLastScannedCode(data);
    
    // Comparación tolerante: normaliza sufijos con padding de ceros
    // Ej: US-9133402085-0001 == US-9133402085-01 == US-9133402085-1
    const stripSuffixZeros = (t: string) => {
      const parts = t.toUpperCase().split('-');
      if (parts.length > 1) {
        const last = parts[parts.length - 1];
        if (/^\d+$/.test(last)) {
          parts[parts.length - 1] = String(parseInt(last, 10));
        }
      }
      return parts.join('-');
    };
    // Forma compacta: sin guiones y mayúsculas. Permite que el chofer
    // escanee "AIR2610265SCHJM040" y matchee la guía "AIR2610265scHjM-040"
    // de su lista (la pistola a veces lee el barcode sin separador).
    const compact = (t: string) => String(t || '').toUpperCase().replace(/-/g, '');
    const dataKey = stripSuffixZeros(data);
    const dataCompact = compact(data);

    // Verificar si el paquete está en la lista
    const packageFound = packagesToReturn.find(
      p => p.tracking_number === data
        || stripSuffixZeros(p.tracking_number) === dataKey
        || compact(p.tracking_number) === dataCompact
        || p.tracking_number.toUpperCase().includes(data.toUpperCase())
    );
    
    if (!packageFound) {
      Vibration.vibrate([0, 200, 100, 200]);
      showFeedback({
        type: 'error',
        message: '❌ Este paquete no está en tu lista de retornos',
      });
      setTimeout(() => {
        setIsScanning(false);
        if (source === 'camera') setScannerActive(true);
        setLastScannedCode('');
      }, source === 'camera' ? 1500 : 500);
      return;
    }

    // Mostrar modal para seleccionar motivo
    setPendingBarcode(packageFound.tracking_number);
    setShowReasonModal(true);
  }, [scannerActive, isScanning, lastScannedCode, packagesToReturn]);

  const handleBarCodeScanned = useCallback(async (result: BarcodeScanningResult) => {
    await processScanCode(result.data, 'camera');
  }, [processScanCode]);

  const handleManualSubmit = async () => {
    const code = normalizeScanCode(manualCode);
    if (!code) return;
    setManualCode('');
    await processScanCode(code, 'scanner');
  };

  const handleConfirmReturn = async () => {
    setShowReasonModal(false);
    
    try {
      const res = await api.post('/api/driver/scan-return', { 
        barcode: pendingBarcode,
        returnReason: selectedReason 
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      
      if (res.data.success) {
        Vibration.vibrate(100);
        setReturnedCount(prev => prev + 1);
        
        // Remover de la lista
        setPackagesToReturn(prev => 
          prev.filter(p => p.tracking_number !== pendingBarcode)
        );
        
        showFeedback({
          type: 'success',
          message: '✅ Paquete devuelto a bodega',
        });
      }
    } catch (error: any) {
      Vibration.vibrate([0, 200, 100, 200, 100, 200]);
      showFeedback({
        type: 'error',
        message: error.response?.data?.error || 'Error al procesar retorno',
      });
    } finally {
      setPendingBarcode('');
      setSelectedReason('client_not_home');
      setTimeout(() => {
        setIsScanning(false);
        setScannerActive(true);
        setLastScannedCode('');
      }, 1000);
    }
  };

  const handleCancelReturn = () => {
    setShowReasonModal(false);
    setPendingBarcode('');
    setSelectedReason('client_not_home');
    setTimeout(() => {
      setIsScanning(false);
      setScannerActive(true);
      setLastScannedCode('');
    }, 500);
  };

  const handleFinishReturns = () => {
    if (packagesToReturn.length > 0) {
      Alert.alert(
        '⚠️ Paquetes Pendientes',
        `Aún tienes ${packagesToReturn.length} paquetes sin devolver. ¿Qué quieres hacer con ellos?`,
        [
          { text: 'Seguir Escaneando', style: 'cancel' },
          { 
            text: 'Reportar Problema', 
            onPress: () => {
              // Navegar a pantalla de reporte
              Alert.alert('📝', 'Contacta a tu supervisor para reportar los paquetes faltantes.');
            }
          },
        ]
      );
    } else {
      Alert.alert(
        '✅ Retorno Completo',
        'Todos los paquetes han sido procesados correctamente.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    }
  };

  const allReturned = packagesToReturn.length === 0 && totalToReturn > 0;

  if (!permission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#F05A28" />
        </View>
      </SafeAreaView>
    );
  }

  if (scanMode === 'camera' && !permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <MaterialIcons name="camera-alt" size={64} color="#ccc" />
          <Text style={styles.permissionTitle}>Permiso de Cámara Requerido</Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Otorgar Permiso</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#F05A28" />
          <Text style={styles.loadingText}>Cargando paquetes pendientes...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Si no hay paquetes que retornar
  if (totalToReturn === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.title}>Retorno a Bodega</Text>
        </View>
        
        <View style={styles.emptyState}>
          <MaterialIcons name="check-circle" size={80} color="#4CAF50" />
          <Text style={styles.emptyTitle}>¡Excelente! 🎉</Text>
          <Text style={styles.emptySubtitle}>
            No tienes paquetes pendientes de retorno.{'\n'}
            Todos fueron entregados exitosamente.
          </Text>
          <TouchableOpacity 
            style={styles.doneButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.doneButtonText}>Volver al Inicio</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={styles.title}>Retorno a Bodega 📥</Text>
          <Text style={styles.subtitle}>Escanea paquetes no entregados</Text>
        </View>
        <TouchableOpacity
          style={styles.modeButton}
          onPress={() => Alert.alert(
            'Selecciona método de captura',
            '¿Deseas usar escáner o cámara?',
            [
              { text: 'Escáner', onPress: () => setScanMode('scanner') },
              { text: 'Cámara', onPress: () => setScanMode('camera') },
              { text: 'Cancelar', style: 'cancel' },
            ]
          )}
        >
          <MaterialIcons name={scanMode === 'camera' ? 'photo-camera' : 'qr-code-scanner'} size={22} color="#F05A28" />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{returnedCount}</Text>
          <Text style={styles.statLabel}>Devueltos</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={[styles.statNumber, { color: '#FF9800' }]}>
            {packagesToReturn.length}
          </Text>
          <Text style={styles.statLabel}>Pendientes</Text>
        </View>
      </View>

      {/* Lista de paquetes pendientes */}
      <View style={styles.listHeader}>
        <MaterialIcons name="inventory" size={20} color="#666" />
        <Text style={styles.listTitle}>
          Paquetes sin Entregar ({packagesToReturn.length})
        </Text>
      </View>
      
      <ScrollView style={styles.listContainer} horizontal>
        {packagesToReturn.map((pkg) => (
          <View key={pkg.id} style={styles.packageCard}>
            <Text style={styles.packageTracking} numberOfLines={1}>
              {pkg.tracking_number}
            </Text>
            <Text style={styles.packageCity}>{pkg.delivery_city}</Text>
            <Text style={styles.packageRecipient} numberOfLines={1}>
              👤 {pkg.recipient_name}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* Scanner */}
      {!allReturned ? (
        <View style={styles.scannerSection}>
          {scanMode === 'camera' ? (
            <>
              <View style={styles.scannerWrapper}>
                <CameraView
                  style={styles.scanner}
                  barcodeScannerSettings={{
                    barcodeTypes: ['code128', 'code39', 'qr', 'ean13', 'ean8', 'upc_a'],
                  }}
                  onBarcodeScanned={scannerActive ? handleBarCodeScanned : undefined}
                />
                
                <View style={styles.scannerOverlay}>
                  <View style={styles.scannerFrame}>
                    <View style={[styles.corner, styles.topLeft]} />
                    <View style={[styles.corner, styles.topRight]} />
                    <View style={[styles.corner, styles.bottomLeft]} />
                    <View style={[styles.corner, styles.bottomRight]} />
                  </View>
                </View>
                
                {isScanning && (
                  <View style={styles.scanningIndicator}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.scanningText}>Procesando...</Text>
                  </View>
                )}
              </View>
              
              <Text style={styles.helperText}>
                📷 Escanea el código del paquete que no pudiste entregar
              </Text>
            </>
          ) : (
            <View style={styles.scannerInputCard}>
              <MaterialIcons name="qr-code-scanner" size={54} color="#F05A28" />
              <Text style={styles.scannerInputTitle}>Modo Escáner</Text>
              <Text style={styles.scannerInputSubtitle}>
                Usa lector externo o captura manualmente la guía.
              </Text>

              <TextInput
                ref={manualInputRef}
                style={styles.scannerInput}
                placeholder="Escanea o escribe el código"
                value={manualCode}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="send"
                autoFocus
                showSoftInputOnFocus={false}
                caretHidden={true}
                blurOnSubmit={false}
                onChangeText={setManualCode}
                onSubmitEditing={handleManualSubmit}
              />

              <TouchableOpacity
                style={[styles.manualSubmitButton, isScanning && styles.manualSubmitButtonDisabled]}
                onPress={handleManualSubmit}
                disabled={isScanning}
              >
                {isScanning ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <MaterialIcons name="check-circle" size={20} color="#fff" />
                    <Text style={styles.manualSubmitText}>Validar código</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.allReturnedSection}>
          <MaterialIcons name="inventory-2" size={60} color="#4CAF50" />
          <Text style={styles.allReturnedTitle}>Todos los Paquetes Procesados</Text>
          <Text style={styles.allReturnedSubtitle}>
            {returnedCount} paquetes devueltos a bodega
          </Text>
        </View>
      )}

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        <TouchableOpacity 
          style={[
            styles.finishButton,
            allReturned && styles.finishButtonSuccess
          ]} 
          onPress={handleFinishReturns}
        >
          <MaterialIcons 
            name={allReturned ? "check-circle" : "assignment-turned-in"} 
            size={24} 
            color="#fff" 
          />
          <Text style={styles.finishButtonText}>
            {allReturned ? 'Finalizar Día' : 'Terminar Retornos'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Feedback Message */}
      {feedback && (
        <Animated.View 
          style={[
            styles.feedbackBox,
            feedback.type === 'error' && styles.feedbackError,
            feedback.type === 'success' && styles.feedbackSuccess,
            { opacity: feedbackOpacity }
          ]}
        >
          <MaterialIcons 
            name={feedback.type === 'success' ? 'check-circle' : 'error'} 
            size={24} 
            color="#fff" 
          />
          <Text style={styles.feedbackText}>{feedback.message}</Text>
        </Animated.View>
      )}

      {/* Modal: Selección de Motivo */}
      <Modal
        visible={showReasonModal}
        transparent
        animationType="slide"
        onRequestClose={handleCancelReturn}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📝 Motivo de Retorno</Text>
              <TouchableOpacity onPress={handleCancelReturn}>
                <MaterialIcons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.modalSubtitle}>
              ¿Por qué no se pudo entregar este paquete?
            </Text>
            
            <ScrollView style={styles.reasonsList}>
              {RETURN_REASONS.map((reason) => (
                <TouchableOpacity
                  key={reason.value}
                  style={[
                    styles.reasonItem,
                    selectedReason === reason.value && styles.reasonItemSelected
                  ]}
                  onPress={() => setSelectedReason(reason.value)}
                >
                  <MaterialIcons 
                    name={reason.icon as any} 
                    size={24} 
                    color={selectedReason === reason.value ? '#F05A28' : '#666'} 
                  />
                  <Text style={[
                    styles.reasonText,
                    selectedReason === reason.value && styles.reasonTextSelected
                  ]}>
                    {reason.label}
                  </Text>
                  {selectedReason === reason.value && (
                    <MaterialIcons name="check-circle" size={20} color="#F05A28" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
            
            <TouchableOpacity 
              style={styles.confirmButton}
              onPress={handleConfirmReturn}
            >
              <MaterialIcons name="send" size={20} color="#fff" />
              <Text style={styles.confirmButtonText}>Confirmar Retorno</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#666',
  },
  
  // Permisos
  permissionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
    color: '#333',
  },
  permissionButton: {
    marginTop: 20,
    backgroundColor: '#F05A28',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    marginLeft: 10,
    flex: 1,
  },
  modeButton: {
    padding: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  
  // Stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 15,
    marginTop: 10,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#eee',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  
  // Lista horizontal
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    paddingBottom: 10,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginLeft: 8,
  },
  listContainer: {
    maxHeight: 100,
    paddingHorizontal: 10,
  },
  packageCard: {
    width: 150,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: '#FF9800',
  },
  packageTracking: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  },
  packageCity: {
    fontSize: 11,
    color: '#F05A28',
    marginTop: 4,
  },
  packageRecipient: {
    fontSize: 10,
    color: '#888',
    marginTop: 4,
  },
  
  // Scanner
  scannerSection: {
    flex: 1,
    padding: 15,
  },
  scannerWrapper: {
    flex: 1,
    borderRadius: 15,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  scanner: {
    flex: 1,
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerFrame: {
    width: 250,
    height: 150,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#FF9800',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  scanningIndicator: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  scanningText: {
    color: '#fff',
    marginLeft: 10,
    fontSize: 14,
  },
  helperText: {
    textAlign: 'center',
    marginTop: 15,
    fontSize: 14,
    color: '#666',
  },
  scannerInputCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerInputTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 10,
  },
  scannerInputSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 18,
    paddingHorizontal: 10,
  },
  scannerInput: {
    width: '100%',
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#fff',
  },
  manualSubmitButton: {
    marginTop: 12,
    backgroundColor: '#F05A28',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 180,
    gap: 8,
  },
  manualSubmitButtonDisabled: {
    opacity: 0.8,
  },
  manualSubmitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  
  // All returned
  allReturnedSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  allReturnedTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginTop: 15,
  },
  allReturnedSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  
  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginTop: 20,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 22,
  },
  doneButton: {
    marginTop: 30,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 8,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  
  // Bottom actions
  bottomActions: {
    padding: 15,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  finishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF9800',
    padding: 15,
    borderRadius: 8,
  },
  finishButtonSuccess: {
    backgroundColor: '#4CAF50',
  },
  finishButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  
  // Feedback
  feedbackBox: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderRadius: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  feedbackSuccess: {
    backgroundColor: '#4CAF50',
  },
  feedbackError: {
    backgroundColor: '#F44336',
  },
  feedbackText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 10,
    flex: 1,
  },
  
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalSubtitle: {
    padding: 20,
    paddingBottom: 10,
    fontSize: 14,
    color: '#666',
  },
  reasonsList: {
    maxHeight: 300,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  reasonItemSelected: {
    backgroundColor: '#fff5f2',
  },
  reasonText: {
    flex: 1,
    marginLeft: 15,
    fontSize: 16,
    color: '#333',
  },
  reasonTextSelected: {
    color: '#F05A28',
    fontWeight: '600',
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F05A28',
    margin: 20,
    padding: 15,
    borderRadius: 8,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 10,
  },
});
