/**
 * WarehouseScannerScreen - Escáner Multisucursal para App Móvil 📦
 * 
 * Funcionalidad:
 * - Escanear códigos de barras (QR, Barcode)
 * - Modo INGRESO y SALIDA
 * - Validación de supervisor por PIN escrito o NFC
 * - Feedback sonoro y vibración
 * - Historial de escaneos del día
 * 
 * Roles permitidos: repartidor, warehouse_ops, counter_staff, branch_manager, admin, super_admin
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Vibration,
  Modal,
  FlatList,
  Platform,
  Animated,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { api } from '../services/api';

// Intentar cargar NFC (puede no estar disponible en todos los dispositivos)
let NfcManager: any = null;
let NfcEvents: any = null;
let Ndef: any = null;
try {
  const nfcModule = require('react-native-nfc-manager');
  NfcManager = nfcModule.default;
  NfcEvents = nfcModule.NfcEvents;
  Ndef = nfcModule.Ndef;
  // Verificar que NfcManager tenga los métodos necesarios
  if (!NfcManager || typeof NfcManager.isSupported !== 'function') {
    NfcManager = null;
  }
} catch (e) {
  // NFC no disponible - silencioso en simulador
  NfcManager = null;
}

const ORANGE = '#F05A28';
const GREEN = '#4CAF50';
const RED = '#F44336';
const BLUE = '#2196F3';
const YELLOW = '#FF9800';

type ScanMode = 'INGRESO' | 'SALIDA' | null;
type TrackingType = 'DHL' | 'AIR' | 'LOG' | 'US' | 'INVALID';

interface BranchInfo {
  branch_id: number;
  branch_code: string;
  branch_name: string;
  worker_name: string;
  allowed_services: string[];
}

interface ScanResult {
  success: boolean;
  message: string;
  package_id?: number;
  tracking_number?: string;
  client_name?: string;
  service_type?: string;
  labelUrl?: string;
  nationalTracking?: string;
  nationalCarrier?: string;
}

interface ScanHistoryItem {
  id: number;
  tracking_number: string;
  scan_type: string;
  scanned_at: string;
  client_name: string;
  service_type: string;
}

interface Props {
  navigation: any;
  route: any;
}

// Detectar tipo de guía
const detectTrackingType = (tracking: string): TrackingType => {
  const trimmed = tracking.trim().toUpperCase();
  
  if (/^\d{10}$/.test(trimmed)) return 'DHL';
  if (/^AIR[-_]?\d+/i.test(trimmed) || /^AIR\d+/i.test(trimmed)) return 'AIR';
  if (/^LOG[-_]?\d+/i.test(trimmed) || /^LOG\d+/i.test(trimmed)) return 'LOG';
  if (/^US[-_]?\d+/i.test(trimmed) || /^US\d+/i.test(trimmed)) return 'US';
  if (/^TRK[-_]?\d+/i.test(trimmed)) return 'AIR';
  
  return 'INVALID';
};

export default function WarehouseScannerScreen({ navigation, route }: Props) {
  const { user, token } = route.params;
  
  // Estados principales
  const [mode, setMode] = useState<ScanMode>(null);
  const [branchInfo, setBranchInfo] = useState<BranchInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scannerActive, setScannerActive] = useState(true);
  const [lastScannedCode, setLastScannedCode] = useState('');
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  
  // Estados para DHL y supervisor
  const [showSupervisorModal, setShowSupervisorModal] = useState(false);
  const [supervisorPin, setSupervisorPin] = useState('');
  const [supervisorError, setSupervisorError] = useState('');
  const [pendingDhlTracking, setPendingDhlTracking] = useState('');
  const [validatingSupervisor, setValidatingSupervisor] = useState(false);
  
  // Estados NFC
  const [nfcSupported, setNfcSupported] = useState(false);
  const [nfcEnabled, setNfcEnabled] = useState(false);
  const [nfcReading, setNfcReading] = useState(false);
  
  // Estadísticas del día
  const [dailyStats, setDailyStats] = useState({ ingresos: 0, salidas: 0 });
  
  // Permisos de cámara
  const [permission, requestPermission] = useCameraPermissions();
  
  // Animaciones
  const feedbackOpacity = useRef(new Animated.Value(0)).current;
  const feedbackScale = useRef(new Animated.Value(1)).current;
  
  // Manual barcode input
  const [manualBarcode, setManualBarcode] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  // ============================================
  // INICIALIZACIÓN
  // ============================================
  useEffect(() => {
    loadBranchInfo();
    loadDailyStats();
    initNfc();
    
    return () => {
      cleanupNfc();
    };
  }, []);

  // ============================================
  // NFC SETUP
  // ============================================
  const initNfc = async () => {
    if (!NfcManager) {
      console.log('NFC Manager no disponible');
      setNfcSupported(false);
      return;
    }
    
    try {
      const supported = await NfcManager.isSupported();
      setNfcSupported(supported);
      
      if (supported) {
        await NfcManager.start();
        const enabled = await NfcManager.isEnabled();
        setNfcEnabled(enabled);
      }
    } catch (error: any) {
      // En simulador o dispositivos sin NFC, esto es esperado
      console.log('NFC no disponible en este dispositivo');
      setNfcSupported(false);
      setNfcEnabled(false);
    }
  };

  const cleanupNfc = () => {
    if (NfcManager) {
      try {
        NfcManager.setEventListener(NfcEvents?.DiscoverTag, null);
        NfcManager.unregisterTagEvent().catch(() => {});
      } catch (e) {}
    }
  };

  // Leer tarjeta NFC para PIN de supervisor
  const startNfcReading = async () => {
    if (!NfcManager || !nfcSupported || !nfcEnabled) {
      Alert.alert('NFC No Disponible', 'Tu dispositivo no soporta NFC o está deshabilitado.');
      return;
    }
    
    setNfcReading(true);
    
    try {
      await NfcManager.registerTagEvent();
      
      NfcManager.setEventListener(NfcEvents.DiscoverTag, async (tag: any) => {
        console.log('📱 Tag NFC detectado:', tag);
        
        Vibration.vibrate(100);
        
        // Extraer datos del tag NFC
        let nfcData = '';
        
        if (tag.ndefMessage && tag.ndefMessage.length > 0) {
          // Intentar leer datos NDEF
          const ndefRecord = tag.ndefMessage[0];
          if (ndefRecord.payload) {
            // Decodificar payload NDEF
            const payloadBytes = ndefRecord.payload;
            // Saltar el primer byte (language code length) y los bytes del language code
            const langCodeLength = payloadBytes[0] & 0x3F;
            nfcData = String.fromCharCode.apply(null, payloadBytes.slice(1 + langCodeLength));
          }
        } else if (tag.id) {
          // Usar el ID del tag como PIN
          nfcData = tag.id.replace(/:/g, '').slice(-8); // Últimos 8 caracteres del ID
        }
        
        if (nfcData) {
          console.log('📱 Datos NFC:', nfcData);
          
          // Validar como PIN de supervisor
          await validateSupervisorWithPin(nfcData);
        } else {
          Alert.alert('Error', 'No se pudo leer la tarjeta NFC');
        }
        
        await NfcManager.unregisterTagEvent();
        setNfcReading(false);
      });
      
    } catch (error) {
      console.error('Error leyendo NFC:', error);
      setNfcReading(false);
      Alert.alert('Error NFC', 'No se pudo leer la tarjeta');
    }
  };

  const cancelNfcReading = async () => {
    if (NfcManager) {
      try {
        await NfcManager.unregisterTagEvent();
      } catch (e) {}
    }
    setNfcReading(false);
  };

  // ============================================
  // API CALLS
  // ============================================
  const loadBranchInfo = async () => {
    try {
      const res = await api.get('/warehouse/branch-info');
      setBranchInfo(res.data);
      setLoading(false);
    } catch (error: any) {
      console.error('Error cargando branch info:', error);
      setLoading(false);
      Alert.alert('Error', error.response?.data?.error || 'No se pudo cargar información de sucursal');
    }
  };

  const loadDailyStats = async () => {
    try {
      const res = await api.get('/warehouse/daily-stats');
      setDailyStats({
        ingresos: res.data.total_ingresos || 0,
        salidas: res.data.total_salidas || 0,
      });
    } catch (error) {
      console.error('Error cargando stats:', error);
    }
  };

  const loadScanHistory = async () => {
    try {
      const res = await api.get('/warehouse/scan-history?limit=50');
      setScanHistory(res.data.history || []);
      setShowHistory(true);
    } catch (error) {
      console.error('Error cargando historial:', error);
    }
  };

  // ============================================
  // BARCODE SCANNING
  // ============================================
  const handleBarCodeScanned = useCallback(async (result: BarcodeScanningResult) => {
    const { data } = result;
    
    if (!scannerActive || scanning || data === lastScannedCode || !mode) {
      return;
    }
    
    setScanning(true);
    setScannerActive(false);
    setLastScannedCode(data);
    
    await processBarcode(data);
    
    // Reactivar escáner después de delay
    setTimeout(() => {
      setScanning(false);
      setScannerActive(true);
      setLastScannedCode('');
    }, 2000);
  }, [scannerActive, scanning, lastScannedCode, mode]);

  const processBarcode = async (barcode: string) => {
    const trackingType = detectTrackingType(barcode.trim());
    
    // Validar tipo
    if (trackingType === 'INVALID') {
      showFeedback({
        success: false,
        message: '❌ Guía no válida. Solo: DHL, AIR-XXX, LOG-XXX, US-XXX',
      });
      playErrorFeedback();
      return;
    }
    
    // Si es DHL, pedir autorización de supervisor
    if (trackingType === 'DHL') {
      setPendingDhlTracking(barcode.trim());
      setShowSupervisorModal(true);
      setSupervisorPin('');
      setSupervisorError('');
      return;
    }
    
    // Procesar guía directamente
    await processTracking(barcode.trim(), trackingType);
  };

  const processTracking = async (tracking: string, trackingType: TrackingType) => {
    setLastResult(null);
    
    try {
      const res = await api.post('/warehouse/scan', {
        barcode: tracking,
        scanType: mode,
        tracking_type: trackingType,
      });
      
      const result: ScanResult = {
        success: res.data.success,
        message: res.data.message,
        package_id: res.data.package?.id,
        tracking_number: res.data.package?.tracking,
        client_name: res.data.package?.clientName,
        service_type: res.data.package?.serviceType,
        labelUrl: res.data.labelUrl,
        nationalTracking: res.data.nationalTracking,
        nationalCarrier: res.data.nationalCarrier,
      };
      
      showFeedback(result);
      
      if (result.success) {
        playSuccessFeedback();
        loadDailyStats();
      } else {
        playErrorFeedback();
      }
      
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Error al procesar escaneo';
      showFeedback({
        success: false,
        message: errorMessage,
      });
      playErrorFeedback();
    }
  };

  // ============================================
  // SUPERVISOR VALIDATION
  // ============================================
  const validateSupervisorWithPin = async (pin: string) => {
    setValidatingSupervisor(true);
    setSupervisorError('');
    
    try {
      const res = await api.post('/warehouse/validate-supervisor', {
        pin: pin,
        branch_id: branchInfo?.branch_id,
        action_type: 'dhl_reception_mobile',
      });
      
      if (res.data.valid) {
        // Autorización exitosa
        setShowSupervisorModal(false);
        setSupervisorPin('');
        playSuccessFeedback();
        
        // Mostrar mensaje de autorización
        Alert.alert(
          '✅ Autorizado',
          `Supervisor: ${res.data.supervisor?.name}\n\nAhora puedes procesar guías DHL.`,
          [{ text: 'OK' }]
        );
        
        // Procesar la guía DHL pendiente
        if (pendingDhlTracking) {
          await processTracking(pendingDhlTracking, 'DHL');
          setPendingDhlTracking('');
        }
        
      } else {
        setSupervisorError('PIN de supervisor incorrecto');
        playErrorFeedback();
      }
    } catch (error: any) {
      setSupervisorError(error.response?.data?.error || 'Error al validar');
      playErrorFeedback();
    } finally {
      setValidatingSupervisor(false);
    }
  };

  const handleSupervisorPinSubmit = () => {
    if (!supervisorPin.trim()) {
      setSupervisorError('Ingresa el PIN');
      return;
    }
    validateSupervisorWithPin(supervisorPin.trim());
  };

  // ============================================
  // FEEDBACK
  // ============================================
  const showFeedback = (result: ScanResult) => {
    setLastResult(result);
    
    Animated.sequence([
      Animated.parallel([
        Animated.timing(feedbackOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(feedbackScale, {
          toValue: 1.1,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(feedbackScale, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.delay(3000),
      Animated.timing(feedbackOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setLastResult(null));
  };

  const playSuccessFeedback = () => {
    Vibration.vibrate(100);
  };

  const playErrorFeedback = () => {
    Vibration.vibrate([0, 200, 100, 200]);
  };

  // ============================================
  // MANUAL INPUT
  // ============================================
  const handleManualSubmit = () => {
    if (!manualBarcode.trim()) return;
    processBarcode(manualBarcode.trim().toUpperCase());
    setManualBarcode('');
    setShowManualInput(false);
  };

  // ============================================
  // RENDER
  // ============================================
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={ORANGE} />
          <Text style={styles.loadingText}>Cargando información...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission?.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Ionicons name="camera-outline" size={80} color="#ccc" />
          <Text style={styles.permissionTitle}>Permiso de Cámara</Text>
          <Text style={styles.permissionText}>
            Necesitamos acceso a la cámara para escanear códigos de barras
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Permitir Cámara</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!branchInfo) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Ionicons name="alert-circle-outline" size={80} color={RED} />
          <Text style={styles.errorTitle}>Sin Sucursal Asignada</Text>
          <Text style={styles.errorText}>
            No tienes una sucursal asignada. Contacta al administrador.
          </Text>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Pantalla de selección de modo
  if (!mode) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>📦 Escáner de Bodega</Text>
          <TouchableOpacity onPress={loadScanHistory}>
            <Ionicons name="time-outline" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Branch Info */}
        <View style={styles.branchCard}>
          <View style={styles.branchIcon}>
            <Ionicons name="business" size={32} color={ORANGE} />
          </View>
          <View style={styles.branchInfo}>
            <Text style={styles.branchName}>{branchInfo.branch_name}</Text>
            <Text style={styles.branchCode}>Código: {branchInfo.branch_code}</Text>
            <Text style={styles.workerName}>👤 {branchInfo.worker_name}</Text>
          </View>
        </View>

        {/* Daily Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: GREEN + '20' }]}>
            <Ionicons name="arrow-down-circle" size={32} color={GREEN} />
            <Text style={[styles.statNumber, { color: GREEN }]}>{dailyStats.ingresos}</Text>
            <Text style={styles.statLabel}>Ingresos Hoy</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: BLUE + '20' }]}>
            <Ionicons name="arrow-up-circle" size={32} color={BLUE} />
            <Text style={[styles.statNumber, { color: BLUE }]}>{dailyStats.salidas}</Text>
            <Text style={styles.statLabel}>Salidas Hoy</Text>
          </View>
        </View>

        {/* Mode Selection */}
        <Text style={styles.selectModeTitle}>Selecciona el tipo de escaneo:</Text>
        
        <View style={styles.modeButtonsContainer}>
          <TouchableOpacity
            style={[styles.modeButton, { backgroundColor: GREEN }]}
            onPress={() => setMode('INGRESO')}
          >
            <Ionicons name="arrow-down-circle-outline" size={60} color="#fff" />
            <Text style={styles.modeButtonText}>INGRESO</Text>
            <Text style={styles.modeButtonSubtext}>Paquete llega a bodega</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeButton, { backgroundColor: BLUE }]}
            onPress={() => setMode('SALIDA')}
          >
            <Ionicons name="arrow-up-circle-outline" size={60} color="#fff" />
            <Text style={styles.modeButtonText}>SALIDA</Text>
            <Text style={styles.modeButtonSubtext}>Paquete sale de bodega</Text>
          </TouchableOpacity>
        </View>

        {/* History Modal */}
        <Modal visible={showHistory} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.historyModal}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyTitle}>📋 Historial de Hoy</Text>
                <TouchableOpacity onPress={() => setShowHistory(false)}>
                  <Ionicons name="close" size={28} color="#333" />
                </TouchableOpacity>
              </View>
              <FlatList
                data={scanHistory}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <View style={styles.historyItem}>
                    <View style={[
                      styles.historyIcon,
                      { backgroundColor: item.scan_type === 'INGRESO' ? GREEN + '20' : BLUE + '20' }
                    ]}>
                      <Ionicons
                        name={item.scan_type === 'INGRESO' ? 'arrow-down' : 'arrow-up'}
                        size={20}
                        color={item.scan_type === 'INGRESO' ? GREEN : BLUE}
                      />
                    </View>
                    <View style={styles.historyContent}>
                      <Text style={styles.historyTracking}>{item.tracking_number}</Text>
                      <Text style={styles.historyClient}>{item.client_name}</Text>
                    </View>
                    <Text style={styles.historyTime}>
                      {new Date(item.scanned_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                )}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>No hay escaneos registrados hoy</Text>
                }
              />
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // Pantalla de escáner activo
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header con modo activo */}
      <View style={[styles.header, { backgroundColor: mode === 'INGRESO' ? GREEN : BLUE }]}>
        <TouchableOpacity onPress={() => setMode(null)}>
          <Ionicons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>
            {mode === 'INGRESO' ? '📥 INGRESO' : '📤 SALIDA'}
          </Text>
          <Text style={styles.headerSubtitle}>{branchInfo.branch_name}</Text>
        </View>
        <TouchableOpacity onPress={() => setShowManualInput(true)}>
          <Ionicons name="keypad-outline" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Scanner */}
      <View style={styles.scannerContainer}>
        <CameraView
          style={styles.scanner}
          barcodeScannerSettings={{
            barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8', 'pdf417'],
          }}
          onBarcodeScanned={scannerActive && !scanning ? handleBarCodeScanned : undefined}
        />
        
        {/* Overlay */}
        <View style={styles.scannerOverlay}>
          <View style={styles.scannerFrame}>
            <View style={styles.cornerTL} />
            <View style={styles.cornerTR} />
            <View style={styles.cornerBL} />
            <View style={styles.cornerBR} />
          </View>
          
          <Text style={styles.scannerHint}>
            {scanning ? '⏳ Procesando...' : '📷 Apunta al código de barras'}
          </Text>
        </View>
      </View>

      {/* Feedback */}
      {lastResult && (
        <Animated.View
          style={[
            styles.feedbackContainer,
            {
              backgroundColor: lastResult.success ? GREEN : RED,
              opacity: feedbackOpacity,
              transform: [{ scale: feedbackScale }],
            },
          ]}
        >
          <Ionicons
            name={lastResult.success ? 'checkmark-circle' : 'close-circle'}
            size={40}
            color="#fff"
          />
          <Text style={styles.feedbackMessage}>{lastResult.message}</Text>
          {lastResult.client_name && (
            <Text style={styles.feedbackDetail}>👤 {lastResult.client_name}</Text>
          )}
          {lastResult.nationalTracking && (
            <Text style={styles.feedbackDetail}>
              🚚 {lastResult.nationalCarrier}: {lastResult.nationalTracking}
            </Text>
          )}
        </Animated.View>
      )}

      {/* Stats Bar */}
      <View style={styles.bottomStats}>
        <View style={styles.bottomStatItem}>
          <Ionicons name="arrow-down" size={20} color={GREEN} />
          <Text style={styles.bottomStatText}>{dailyStats.ingresos} ingresos</Text>
        </View>
        <View style={styles.bottomStatDivider} />
        <View style={styles.bottomStatItem}>
          <Ionicons name="arrow-up" size={20} color={BLUE} />
          <Text style={styles.bottomStatText}>{dailyStats.salidas} salidas</Text>
        </View>
      </View>

      {/* Manual Input Modal */}
      <Modal visible={showManualInput} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.manualInputModal}>
            <Text style={styles.manualInputTitle}>📝 Ingreso Manual</Text>
            <TextInput
              style={styles.manualInput}
              placeholder="Código de barras"
              placeholderTextColor="#999"
              value={manualBarcode}
              onChangeText={setManualBarcode}
              autoCapitalize="characters"
              autoFocus
            />
            <View style={styles.manualInputButtons}>
              <TouchableOpacity
                style={[styles.manualButton, { backgroundColor: '#ccc' }]}
                onPress={() => { setShowManualInput(false); setManualBarcode(''); }}
              >
                <Text style={styles.manualButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.manualButton, { backgroundColor: ORANGE }]}
                onPress={handleManualSubmit}
              >
                <Text style={[styles.manualButtonText, { color: '#fff' }]}>Procesar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Supervisor Modal */}
      <Modal visible={showSupervisorModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.supervisorModal}>
            <View style={styles.supervisorHeader}>
              <Ionicons name="shield-checkmark" size={50} color={YELLOW} />
              <Text style={styles.supervisorTitle}>🔐 Autorización Requerida</Text>
              <Text style={styles.supervisorSubtitle}>
                Las guías DHL requieren PIN de supervisor
              </Text>
            </View>

            <View style={styles.supervisorTracking}>
              <Text style={styles.trackingLabel}>Guía:</Text>
              <Text style={styles.trackingValue}>{pendingDhlTracking}</Text>
            </View>

            {/* PIN Input */}
            <TextInput
              style={styles.pinInput}
              placeholder="Ingresa PIN de supervisor"
              placeholderTextColor="#999"
              value={supervisorPin}
              onChangeText={(text) => { setSupervisorPin(text); setSupervisorError(''); }}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={10}
            />

            {supervisorError ? (
              <Text style={styles.supervisorError}>{supervisorError}</Text>
            ) : null}

            {/* NFC Option */}
            {nfcSupported && nfcEnabled && (
              <TouchableOpacity
                style={styles.nfcButton}
                onPress={nfcReading ? cancelNfcReading : startNfcReading}
              >
                <Ionicons name="wifi" size={24} color={nfcReading ? ORANGE : '#666'} />
                <Text style={[styles.nfcButtonText, nfcReading && { color: ORANGE }]}>
                  {nfcReading ? 'Acerca tu tarjeta NFC...' : 'Usar Tarjeta NFC'}
                </Text>
                {nfcReading && <ActivityIndicator size="small" color={ORANGE} />}
              </TouchableOpacity>
            )}

            <View style={styles.supervisorButtons}>
              <TouchableOpacity
                style={[styles.supervisorButton, { backgroundColor: '#ccc' }]}
                onPress={() => {
                  setShowSupervisorModal(false);
                  setPendingDhlTracking('');
                  cancelNfcReading();
                }}
              >
                <Text style={styles.supervisorButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.supervisorButton, { backgroundColor: GREEN }]}
                onPress={handleSupervisorPinSubmit}
                disabled={validatingSupervisor || !supervisorPin.trim()}
              >
                {validatingSupervisor ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.supervisorButtonText, { color: '#fff' }]}>
                    Validar PIN
                  </Text>
                )}
              </TouchableOpacity>
            </View>
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
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: ORANGE,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  branchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  branchIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: ORANGE + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  branchInfo: {
    flex: 1,
  },
  branchName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  branchCode: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  workerName: {
    fontSize: 14,
    color: ORANGE,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  selectModeTitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  modeButtonsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
  },
  modeButton: {
    flex: 1,
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
  },
  modeButtonText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 12,
  },
  modeButtonSubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  scannerContainer: {
    flex: 1,
    position: 'relative',
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
    width: 280,
    height: 280,
    position: 'relative',
  },
  cornerTL: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 40,
    height: 40,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#fff',
  },
  cornerTR: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 40,
    height: 40,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: '#fff',
  },
  cornerBL: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 40,
    height: 40,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#fff',
  },
  cornerBR: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: '#fff',
  },
  scannerHint: {
    position: 'absolute',
    bottom: 80,
    fontSize: 16,
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  feedbackContainer: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  feedbackMessage: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
    textAlign: 'center',
  },
  feedbackDetail: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  bottomStats: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bottomStatDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#ddd',
    marginHorizontal: 24,
  },
  bottomStatText: {
    fontSize: 14,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  historyModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 30,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  historyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  historyContent: {
    flex: 1,
  },
  historyTracking: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  historyClient: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  historyTime: {
    fontSize: 12,
    color: '#999',
  },
  emptyText: {
    textAlign: 'center',
    padding: 40,
    color: '#999',
  },
  manualInputModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  manualInputTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 16,
  },
  manualInput: {
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    marginBottom: 16,
  },
  manualInputButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  manualButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  manualButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  supervisorModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  supervisorHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  supervisorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 12,
  },
  supervisorSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  supervisorTracking: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  trackingLabel: {
    fontSize: 14,
    color: '#666',
    marginRight: 8,
  },
  trackingValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  pinInput: {
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 8,
    marginBottom: 12,
  },
  supervisorError: {
    color: RED,
    textAlign: 'center',
    marginBottom: 12,
  },
  nfcButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  nfcButtonText: {
    fontSize: 16,
    color: '#666',
  },
  supervisorButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  supervisorButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  supervisorButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
  },
  permissionText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  permissionButton: {
    backgroundColor: ORANGE,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: RED,
    marginTop: 20,
  },
  errorText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  backButton: {
    backgroundColor: '#666',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
});
