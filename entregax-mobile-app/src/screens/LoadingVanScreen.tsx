/**
 * LoadingVanScreen - Pantalla de Carga de Unidad (Scan-to-Load)
 * 
 * Funcionalidad:
 * - Muestra progreso de carga: X/Y paquetes escaneados
 * - Valida que cada paquete sea del chofer correcto
 * - Bloquea avance al mapa hasta cargar todos los paquetes
 * - Feedback visual y sonoro para éxito/error
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
  Platform,
  Modal,
  FlatList,
  TextInput,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { Audio } from 'expo-av';
import api from '../services/api';

interface RouteData {
  totalAssigned: number;
  loadedToday: number;
  deliveredToday: number;
  pendingToLoad: number;
  pendingPackages: PackageItem[];
  loadedPackages: PackageItem[];
}

interface PackageItem {
  id: number;
  tracking_number: string;
  delivery_address: string;
  delivery_city: string;
  delivery_zip: string;
  recipient_name: string;
  recipient_phone: string;
  loaded_at?: string;
}

interface FeedbackMessage {
  type: 'success' | 'error' | 'warning';
  message: string;
  details?: string;
  errorData?: any;
  httpStatus?: number;
  scannedCode?: string;
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
    .replace(/[_']/g, '-')
    .replace(/\s+/g, '')
    .toUpperCase();

  const canonicalTracking = code.match(/[A-Z]{2,}-[A-Z0-9]{2,}(?:-[A-Z0-9]{2,})*/);
  if (canonicalTracking?.[0]) {
    return canonicalTracking[0];
  }

  const compactTracking = code.match(/[A-Z]{2,}[A-Z0-9]{4,}/);
  if (compactTracking?.[0]) {
    const compact = compactTracking[0];
    return `${compact.slice(0, 2)}-${compact.slice(2)}`;
  }

  return code;
};

export default function LoadingVanScreen({ navigation, route }: any) {
  const token = route?.params?.token;
  const initialScanMode: ScanMode = route?.params?.scanMode === 'scanner' ? 'scanner' : 'camera';
  const [loading, setLoading] = useState(true);
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [scannedCount, setScannedCount] = useState(0);
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);
  const [errorDetail, setErrorDetail] = useState<FeedbackMessage | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scannerActive, setScannerActive] = useState(true);
  const [lastScannedCode, setLastScannedCode] = useState<string>('');
  const [showPackageList, setShowPackageList] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>(initialScanMode);
  const [manualCode, setManualCode] = useState('');
  
  const [permission, requestPermission] = useCameraPermissions();
  
  // Animaciones
  const feedbackOpacity = useRef(new Animated.Value(0)).current;
  const progressWidth = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(1)).current;
  
  // Sonidos
  const successSound = useRef<Audio.Sound | null>(null);
  const errorSound = useRef<Audio.Sound | null>(null);
  const hasAskedModeRef = useRef(false);
  const manualInputRef = useRef<TextInput | null>(null);
  const autoSubmitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadRouteData();
    loadSounds();
    
    return () => {
      // Limpiar sonidos
      if (successSound.current) successSound.current.unloadAsync();
      if (errorSound.current) errorSound.current.unloadAsync();
    };
  }, []);

  useEffect(() => {
    if (!route?.params?.scanMode && !hasAskedModeRef.current) {
      hasAskedModeRef.current = true;
      Alert.alert(
        'Modo de captura',
        '¿Qué deseas usar para cargar paquetes?',
        [
          { text: 'Escáner', onPress: () => setScanMode('scanner') },
          { text: 'Cámara', onPress: () => setScanMode('camera') },
        ]
      );
    }
  }, [route?.params?.scanMode]);

  useEffect(() => {
    if (scanMode === 'scanner') {
      setScannerActive(false);
      // Auto-foco al TextInput para escanear o escribir inmediatamente
      setTimeout(() => manualInputRef.current?.focus(), 150);
      setTimeout(() => manualInputRef.current?.focus(), 500);
    } else {
      setScannerActive(true);
    }
  }, [scanMode]);

  const loadSounds = async () => {
    try {
      // En producción, cargarías archivos de sonido reales
      // Por ahora, usamos el sistema de vibración como feedback
    } catch (error) {
      console.log('Audio no disponible');
    }
  };

  const loadRouteData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/driver/route-today', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.data.success) {
        setRouteData(res.data.route);
        setScannedCount(res.data.route.loadedToday || 0);
        
        // Animar barra de progreso
        const total = res.data.route.pendingToLoad + res.data.route.loadedToday;
        if (total > 0) {
          Animated.timing(progressWidth, {
            toValue: (res.data.route.loadedToday / total) * 100,
            duration: 500,
            useNativeDriver: false,
          }).start();
        }
      }
    } catch (error) {
      console.error('Error cargando ruta:', error);
      Alert.alert('Error', 'No se pudo cargar la información de tu ruta');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectScanMode = () => {
    Alert.alert(
      'Cambiar modo',
      'Selecciona el método para capturar la guía:',
      [
        { text: 'Escáner', onPress: () => setScanMode('scanner') },
        { text: 'Cámara', onPress: () => setScanMode('camera') },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  };

  const showFeedback = (fb: FeedbackMessage) => {
    setFeedback(fb);
    // Errores y advertencias permanecen visibles más tiempo para poder tocarlos
    const dismissDelay = fb.type === 'success' ? 2500 : 6000;
    Animated.sequence([
      Animated.timing(feedbackOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(dismissDelay),
      Animated.timing(feedbackOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setFeedback(null));
  };

  const playSuccessAnimation = () => {
    Animated.sequence([
      Animated.timing(successScale, {
        toValue: 1.2,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(successScale, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const processScanCode = useCallback(async (rawCode: string, source: 'camera' | 'scanner' = 'camera') => {
    const data = normalizeScanCode(rawCode);

    if (!data || isScanning) {
      return;
    }

    // Evitar escaneos duplicados rápidos con cámara
    if (source === 'camera' && (!scannerActive || data === lastScannedCode)) {
      return;
    }

    setIsScanning(true);
    if (source === 'camera') {
      setScannerActive(false);
    }
    setLastScannedCode(data);

    try {
      const res = await api.post('/api/driver/scan-load', { barcode: data }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      
      if (res.data.success) {
        // ÉXITO: Vibración corta, feedback verde
        Vibration.vibrate(100);
        playSuccessAnimation();
        
        const newCount = scannedCount + 1;
        setScannedCount(newCount);
        
        // Actualizar progreso
        if (routeData) {
          const total = routeData.pendingToLoad + routeData.loadedToday;
          Animated.timing(progressWidth, {
            toValue: (newCount / total) * 100,
            duration: 300,
            useNativeDriver: false,
          }).start();
        }
        
        showFeedback({
          type: 'success',
          message: res.data.message || '✅ Paquete cargado',
          details: res.data.package?.trackingNumber,
        });
        
        // Refrescar datos
        loadRouteData();
      }
    } catch (error: any) {
      // ERROR: Vibración larga, feedback rojo
      Vibration.vibrate([0, 200, 100, 200, 100, 200]);
      
      const respData = error?.response?.data;
      const errorMsg = respData?.error || error?.message || 'Error al escanear';
      showFeedback({
        type: 'error',
        message: errorMsg,
        details: data,
        errorData: respData,
        httpStatus: error?.response?.status,
        scannedCode: data,
      });
    } finally {
      // Reactivar escáner después de un delay
      setTimeout(() => {
        setIsScanning(false);
        if (source === 'camera') {
          setScannerActive(true);
        } else if (scanMode === 'scanner') {
          Keyboard.dismiss();
          manualInputRef.current?.focus();
        }
        setLastScannedCode('');
      }, source === 'camera' ? 1500 : 500);
    }
  }, [scannerActive, isScanning, lastScannedCode, scannedCount, routeData, token, scanMode]);

  const handleBarCodeScanned = useCallback(async (result: BarcodeScanningResult) => {
    const { data } = result;
    await processScanCode(data, 'camera');
  }, [processScanCode]);

  const handleManualSubmit = async () => {
    if (autoSubmitTimer.current) {
      clearTimeout(autoSubmitTimer.current);
      autoSubmitTimer.current = null;
    }
    const code = normalizeScanCode(manualCode);
    if (!code) {
      return;
    }
    setManualCode('');
    await processScanCode(code, 'scanner');
  };

  // Auto-submit: la mayoría de scanners USB/HID escriben rápido sin ENTER.
  // Si el código deja de cambiar por ~250ms y parece válido, lo enviamos solos.
  const handleScannerInputChange = (raw: string) => {
    setManualCode(raw);

    if (autoSubmitTimer.current) {
      clearTimeout(autoSubmitTimer.current);
      autoSubmitTimer.current = null;
    }

    const normalized = normalizeScanCode(raw);
    // Solo auto-enviar si parece un tracking razonable (>=8 chars, alfanumérico)
    if (!normalized || normalized.length < 8) return;

    autoSubmitTimer.current = setTimeout(async () => {
      if (isScanning) return;
      const code = normalizeScanCode(raw);
      if (!code) return;
      setManualCode('');
      await processScanCode(code, 'scanner');
    }, 250);
  };

  const totalPackages = routeData 
    ? routeData.pendingToLoad + routeData.loadedToday 
    : 0;
    
  const isLoadComplete = routeData 
    ? routeData.pendingToLoad === 0 && routeData.loadedToday > 0
    : false;

  const handleGoToRoute = () => {
    if (!isLoadComplete && routeData && routeData.pendingToLoad > 0) {
      Alert.alert(
        '⚠️ Carga Incompleta',
        `Aún faltan ${routeData.pendingToLoad} paquetes por cargar. ¿Deseas continuar de todas formas?`,
        [
          { text: 'Seguir Escaneando', style: 'cancel' },
          { 
            text: 'Ir a Ruta (Con Faltantes)', 
            style: 'destructive',
            onPress: () => navigation.navigate('DriverHome', { user: route?.params?.user, token })
          },
        ]
      );
    } else {
      navigation.navigate('DriverHome', { user: route?.params?.user, token });
    }
  };

  if (scanMode === 'camera' && !permission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#F05A28" />
          <Text style={styles.loadingText}>Cargando cámara...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (scanMode === 'camera' && !permission?.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <MaterialIcons name="camera-alt" size={64} color="#ccc" />
          <Text style={styles.permissionTitle}>Permiso de Cámara Requerido</Text>
          <Text style={styles.permissionText}>
            Necesitamos acceso a la cámara para escanear los códigos de barras de los paquetes.
          </Text>
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
          <Text style={styles.loadingText}>Cargando tu ruta del día...</Text>
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
          <Text style={styles.title}>Carga de Unidad 🚚</Text>
          <Text style={styles.subtitle}>Escanea cada paquete antes de salir</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleSelectScanMode} style={styles.modeButton}>
            <MaterialIcons name={scanMode === 'camera' ? 'photo-camera' : 'qr-code-scanner'} size={22} color="#F05A28" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowPackageList(true)} style={styles.listButton}>
            <MaterialIcons name="list" size={24} color="#F05A28" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress Section */}
      <View style={styles.progressSection}>
        <Animated.View style={[styles.counterBox, { transform: [{ scale: successScale }] }]}>
          <Text style={[styles.counterText, isLoadComplete && styles.counterComplete]}>
            {scannedCount} / {totalPackages}
          </Text>
          <Text style={styles.counterLabel}>Paquetes Cargados</Text>
        </Animated.View>
        
        {/* Progress Bar */}
        <View style={styles.progressBarContainer}>
          <Animated.View 
            style={[
              styles.progressBar,
              { 
                width: progressWidth.interpolate({
                  inputRange: [0, 100],
                  outputRange: ['0%', '100%'],
                }),
                backgroundColor: isLoadComplete ? '#4CAF50' : '#F05A28',
              }
            ]} 
          />
        </View>
        
        {routeData && routeData.pendingToLoad > 0 && (
          <Text style={styles.pendingText}>
            📦 {routeData.pendingToLoad} paquetes pendientes de cargar
          </Text>
        )}
      </View>

      {/* Scanner or Success View */}
      {!isLoadComplete ? (
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
                
                {/* Scanner Overlay */}
                <View style={styles.scannerOverlay}>
                  <View style={styles.scannerFrame}>
                    <View style={[styles.corner, styles.topLeft]} />
                    <View style={[styles.corner, styles.topRight]} />
                    <View style={[styles.corner, styles.bottomLeft]} />
                    <View style={[styles.corner, styles.bottomRight]} />
                  </View>
                </View>
                
                {/* Scanning Indicator */}
                {isScanning && (
                  <View style={styles.scanningIndicator}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.scanningText}>Verificando...</Text>
                  </View>
                )}
              </View>
              
              <Text style={styles.helperText}>
                📷 Apunta al código de barras de la caja
              </Text>
            </>
          ) : (
            <View style={styles.scannerInputCard}>
              <MaterialIcons name="qr-code-scanner" size={54} color="#F05A28" />
              <Text style={styles.scannerInputTitle}>Modo Escáner</Text>
              <Text style={styles.scannerInputSubtitle}>
                Usa el lector externo o captura manualmente la guía.
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
                onChangeText={handleScannerInputChange}
                onSubmitEditing={handleManualSubmit}
                onBlur={() => {
                  if (scanMode === 'scanner') {
                    setTimeout(() => manualInputRef.current?.focus(), 80);
                  }
                }}
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
        <View style={styles.successSection}>
          <View style={styles.successIcon}>
            <MaterialIcons name="check-circle" size={100} color="#4CAF50" />
          </View>
          <Text style={styles.successTitle}>¡Carga Completa! 🎉</Text>
          <Text style={styles.successSubtitle}>
            Todos los paquetes han sido verificados y cargados en tu unidad.
          </Text>
          
          <TouchableOpacity style={styles.routeButton} onPress={handleGoToRoute}>
            <MaterialIcons name="map" size={24} color="#fff" />
            <Text style={styles.routeButtonText}>IR AL MAPA DE RUTA</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Feedback Message */}
      {feedback && (
        <Animated.View 
          style={[
            styles.feedbackBox,
            feedback.type === 'error' && styles.feedbackError,
            feedback.type === 'success' && styles.feedbackSuccess,
            feedback.type === 'warning' && styles.feedbackWarning,
            { opacity: feedbackOpacity }
          ]}
        >
          <TouchableOpacity
            activeOpacity={feedback.type === 'error' || feedback.type === 'warning' ? 0.7 : 1}
            disabled={feedback.type === 'success'}
            onPress={() => {
              if (feedback.type === 'error' || feedback.type === 'warning') {
                setErrorDetail(feedback);
              }
            }}
            style={styles.feedbackTouchable}
          >
            <MaterialIcons 
              name={feedback.type === 'success' ? 'check-circle' : feedback.type === 'error' ? 'error' : 'warning'} 
              size={24} 
              color="#fff" 
            />
            <View style={styles.feedbackContent}>
              <Text style={styles.feedbackText}>{feedback.message}</Text>
              {feedback.details ? (
                <Text style={styles.feedbackDetails}>{feedback.details}</Text>
              ) : null}
              {(feedback.type === 'error' || feedback.type === 'warning') ? (
                <Text style={styles.feedbackHint}>Toca para ver detalles ▸</Text>
              ) : null}
            </View>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Modal: Detalle del Error */}
      <Modal
        visible={!!errorDetail}
        transparent
        animationType="fade"
        onRequestClose={() => setErrorDetail(null)}
      >
        <View style={styles.errorModalOverlay}>
          <View style={styles.errorModalCard}>
            <View style={styles.errorModalHeader}>
              <MaterialIcons
                name={errorDetail?.type === 'warning' ? 'warning' : 'error'}
                size={32}
                color={errorDetail?.type === 'warning' ? '#FFA726' : '#F44336'}
              />
              <Text style={styles.errorModalTitle}>Detalle del rechazo</Text>
              <TouchableOpacity onPress={() => setErrorDetail(null)}>
                <MaterialIcons name="close" size={26} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: 12 }}>
              <Text style={styles.errorModalLabel}>Motivo</Text>
              <Text style={styles.errorModalValue}>{errorDetail?.message || '—'}</Text>

              {errorDetail?.scannedCode ? (
                <>
                  <Text style={styles.errorModalLabel}>Código escaneado</Text>
                  <Text style={styles.errorModalValueMono}>{errorDetail.scannedCode}</Text>
                </>
              ) : null}

              {typeof errorDetail?.httpStatus === 'number' ? (
                <>
                  <Text style={styles.errorModalLabel}>Código HTTP</Text>
                  <Text style={styles.errorModalValueMono}>{String(errorDetail.httpStatus)}</Text>
                </>
              ) : null}

              {errorDetail?.errorData?.currentStatus ? (
                <>
                  <Text style={styles.errorModalLabel}>Estado actual del paquete</Text>
                  <Text style={styles.errorModalValueMono}>{String(errorDetail.errorData.currentStatus)}</Text>
                </>
              ) : null}

              {errorDetail?.errorData?.paymentStatus ? (
                <>
                  <Text style={styles.errorModalLabel}>Estado de pago</Text>
                  <Text style={styles.errorModalValueMono}>{String(errorDetail.errorData.paymentStatus)}</Text>
                </>
              ) : null}

              {typeof errorDetail?.errorData?.hasLabel === 'boolean' ? (
                <>
                  <Text style={styles.errorModalLabel}>¿Tiene etiqueta?</Text>
                  <Text style={styles.errorModalValueMono}>{errorDetail.errorData.hasLabel ? 'Sí' : 'No'}</Text>
                </>
              ) : null}

              {errorDetail?.errorData?.assignedTo ? (
                <>
                  <Text style={styles.errorModalLabel}>Asignado a</Text>
                  <Text style={styles.errorModalValue}>{String(errorDetail.errorData.assignedTo)}</Text>
                </>
              ) : null}

              {errorDetail?.errorData?.loadedAt ? (
                <>
                  <Text style={styles.errorModalLabel}>Cargado el</Text>
                  <Text style={styles.errorModalValueMono}>{String(errorDetail.errorData.loadedAt)}</Text>
                </>
              ) : null}

              <Text style={styles.errorModalLabel}>Respuesta completa</Text>
              <View style={styles.errorModalRaw}>
                <Text style={styles.errorModalRawText}>
                  {errorDetail?.errorData
                    ? JSON.stringify(errorDetail.errorData, null, 2)
                    : 'Sin datos del servidor'}
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.errorModalCloseBtn}
              onPress={() => setErrorDetail(null)}
            >
              <Text style={styles.errorModalCloseText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Bottom Actions - Solo si hay paquetes cargados pero no está completo */}
      {!isLoadComplete && scannedCount > 0 && (
        <View style={styles.bottomActions}>
          <TouchableOpacity 
            style={[styles.continueButton, styles.buttonOutline]} 
            onPress={handleGoToRoute}
          >
            <MaterialIcons name="warning" size={20} color="#F05A28" />
            <Text style={styles.continueButtonText}>Salir con {routeData?.pendingToLoad} Faltantes</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal: Lista de Paquetes */}
      <Modal
        visible={showPackageList}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPackageList(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>📦 Lista de Paquetes</Text>
            <TouchableOpacity onPress={() => setShowPackageList(false)}>
              <MaterialIcons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>
          
          {/* Tabs */}
          <View style={styles.tabContainer}>
            <Text style={styles.tabTitle}>
              Pendientes ({routeData?.pendingPackages.length || 0})
            </Text>
          </View>
          
          <FlatList
            data={routeData?.pendingPackages || []}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <View style={styles.packageItem}>
                <View style={styles.packageIcon}>
                  <MaterialIcons name="inventory-2" size={24} color="#F05A28" />
                </View>
                <View style={styles.packageInfo}>
                  <Text style={styles.packageTracking}>{item.tracking_number}</Text>
                  <Text style={styles.packageAddress} numberOfLines={1}>
                    {item.delivery_address}
                  </Text>
                  <Text style={styles.packageRecipient}>
                    👤 {item.recipient_name}
                  </Text>
                </View>
                <View style={styles.packageStatus}>
                  <MaterialIcons name="hourglass-empty" size={20} color="#FF9800" />
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyList}>
                <MaterialIcons name="check-circle" size={48} color="#4CAF50" />
                <Text style={styles.emptyText}>Todos los paquetes han sido cargados</Text>
              </View>
            }
          />

          {routeData && routeData.loadedPackages.length > 0 && (
            <>
              <View style={styles.tabContainer}>
                <Text style={styles.tabTitle}>
                  ✅ Cargados ({routeData.loadedPackages.length})
                </Text>
              </View>
              <FlatList
                data={routeData.loadedPackages}
                keyExtractor={(item) => item.id.toString()}
                style={{ maxHeight: 200 }}
                renderItem={({ item }) => (
                  <View style={[styles.packageItem, styles.packageLoaded]}>
                    <View style={styles.packageIcon}>
                      <MaterialIcons name="check-circle" size={24} color="#4CAF50" />
                    </View>
                    <View style={styles.packageInfo}>
                      <Text style={styles.packageTracking}>{item.tracking_number}</Text>
                      <Text style={styles.packageAddress} numberOfLines={1}>
                        {item.delivery_address}
                      </Text>
                    </View>
                  </View>
                )}
              />
            </>
          )}
        </SafeAreaView>
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
    marginTop: 15,
    fontSize: 16,
    color: '#666',
  },
  
  // Permisos
  permissionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 20,
    color: '#333',
  },
  permissionText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 40,
  },
  permissionButton: {
    marginTop: 30,
    backgroundColor: '#F05A28',
    paddingHorizontal: 30,
    paddingVertical: 15,
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
    flex: 1,
    marginLeft: 10,
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
  listButton: {
    padding: 5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modeButton: {
    padding: 5,
  },
  
  // Progress Section
  progressSection: {
    padding: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  counterBox: {
    alignItems: 'center',
    marginBottom: 15,
  },
  counterText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#F05A28',
  },
  counterComplete: {
    color: '#4CAF50',
  },
  counterLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  progressBarContainer: {
    width: '100%',
    height: 10,
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 5,
  },
  pendingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#FF9800',
    fontWeight: '500',
  },
  
  // Scanner Section
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
    borderColor: '#F05A28',
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
  
  // Success Section
  successSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  successIcon: {
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 10,
  },
  successSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  routeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  routeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  
  // Feedback
  feedbackBox: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    borderRadius: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  feedbackTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
  },
  feedbackSuccess: {
    backgroundColor: '#4CAF50',
  },
  feedbackError: {
    backgroundColor: '#F44336',
  },
  feedbackWarning: {
    backgroundColor: '#FF9800',
  },
  feedbackContent: {
    flex: 1,
    marginLeft: 10,
  },
  feedbackText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  feedbackDetails: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 2,
  },
  feedbackHint: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  // Error detail modal
  errorModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorModalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    elevation: 8,
  },
  errorModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  errorModalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222',
    marginLeft: 8,
  },
  errorModalLabel: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  errorModalValue: {
    fontSize: 15,
    color: '#222',
    marginTop: 4,
  },
  errorModalValueMono: {
    fontSize: 14,
    color: '#222',
    marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  errorModalRaw: {
    marginTop: 6,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 10,
  },
  errorModalRawText: {
    fontSize: 12,
    color: '#444',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  errorModalCloseBtn: {
    marginTop: 14,
    backgroundColor: '#F05A28',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  errorModalCloseText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  
  // Bottom Actions
  bottomActions: {
    padding: 15,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 8,
  },
  buttonOutline: {
    borderWidth: 2,
    borderColor: '#F05A28',
    backgroundColor: '#fff',
  },
  continueButtonText: {
    color: '#F05A28',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  
  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  tabContainer: {
    padding: 15,
    backgroundColor: '#fff',
    marginTop: 10,
  },
  tabTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  packageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  packageLoaded: {
    backgroundColor: '#f9fff9',
  },
  packageIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff5f2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  packageInfo: {
    flex: 1,
    marginLeft: 12,
  },
  packageTracking: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  packageAddress: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  packageRecipient: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  packageStatus: {
    padding: 5,
  },
  emptyList: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 15,
    fontSize: 16,
    color: '#4CAF50',
    textAlign: 'center',
  },
});
