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
  client_number?: string;
  reference_hint?: string;
  box_number?: number | string;
  total_boxes?: number | string;
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

// Mapea el prefijo del tracking interno al icono + color del servicio.
// LOG  → barco (marítimo, azul)
// AIR  → avión (aéreo China, naranja)
// DHL/AA → avión amarillo (DHL)
// US   → camión (PO Box USA, verde)
const getServiceIcon = (trackingNumber: string): { name: keyof typeof MaterialIcons.glyphMap; color: string } => {
  const tn = String(trackingNumber || '').toUpperCase().trim();
  if (tn.startsWith('LOG')) return { name: 'directions-boat', color: '#1976D2' };
  if (tn.startsWith('AIR')) return { name: 'flight', color: '#F05A28' };
  if (tn.startsWith('DHL') || tn.startsWith('AA')) return { name: 'flight', color: '#FFC107' };
  if (tn.startsWith('US')) return { name: 'local-shipping', color: '#4CAF50' };
  return { name: 'inventory-2', color: '#F05A28' };
};

const normalizeScanCode = (rawCode: string): string => {
  if (!rawCode) return '';

  let code = String(rawCode)
    .replace(/[\r\n\t]/g, '')
    .trim();

  // Las pistolas que lanzan el QR como pulsaciones de teclado interpretan
  // los caracteres especiales con el layout configurado en el celular. En
  // español, `:` se convierte en `Ñ` y `/` en `-`, así que un QR que contiene
  // "https://app.entregax.com/track/AIR2610265SCHJM040" llega como
  // "httpsÑ--app.entregax.com-track-AIR2610265SCHJM040". Sólo aplicamos
  // este desmangle si el string parece URL — no podemos confundir un guión
  // legítimo dentro de un tracking AIR con un slash.
  if (/^https?Ñ|^http?Ñ/i.test(code) || code.toLowerCase().startsWith('httpsñ') || code.toLowerCase().startsWith('httpñ')) {
    code = code.replace(/Ñ/g, ':').replace(/-/g, '/');
  }

  try {
    code = decodeURIComponent(code);
  } catch {
    // ignore decode errors
  }

  // Tolera tanto `/track/<X>` (URL real) como `-track-<X>` (URL mangled por
  // teclado español que no fue desmangleado arriba) para extraer el tracking.
  const fromTrackPath = code.match(/[\/\-]track[\/\-]([A-Za-z0-9\-_]+)/i);
  if (fromTrackPath?.[1]) {
    code = fromTrackPath[1];
  }

  const fromQuery = code.match(/[?&](?:track|tracking|barcode|code)=([^&#\s]+)/i);
  if (fromQuery?.[1]) {
    code = fromQuery[1];
  }

  // Las pistolas a veces convierten el `-` del barcode en `'`, `’`, `,` o
  // `_` según el layout del teclado. Mapeamos todos esos a `-` antes de
  // extraer el tracking, igual que en la web.
  code = code
    .replace(/[_'`,’‘]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/\s+/g, '')
    .toUpperCase();

  // Match canónico SOLO con prefijos de servicio conocidos Y guión presente.
  // Antes el regex era `[A-Z]{2,}-[A-Z0-9]{2,}` y para entrada
  // `AIR2610265SCHJM-040` agarraba `SCHJM-040` (5 letras seguidas + dash)
  // truncando todo el master. Después de anclar al prefijo, surgió OTRO
  // problema: para input sin guión como `LOG26CNMX0007701` el regex
  // matcheaba todo el string como "ya canónico" y se brincaba la lógica
  // de inserción de guión más abajo. Por eso ahora exigimos `-` explícito.
  const canonicalTracking = code.match(/(?:AIR|LOG|DHL|AA|US|CN|MX)[A-Z0-9]+-[A-Z0-9]+(?:-[A-Z0-9]+)*/);
  if (canonicalTracking?.[0]) {
    return canonicalTracking[0];
  }

  // Servicios con prefijo de 3 letras (LOG / AIR / DHL).
  // Importante: distinguir el MASTER (solo el código base) de un CHILD
  // (master + dígitos del paquete específico) por longitud, para no romper
  // un master "LOG26CNMX00077" partiéndolo como si llevara child.
  //
  //   Master LOG  ≈ "LOG" + 11 chars  → 14 total  (ej. LOG26CNMX00077)
  //   Child LOG   = master + "-" + 2 ó 4 dígitos
  //                 (ej. LOG26CNMX00077-01 ó LOG26CNMX00077-0001)
  //   Master AIR  ≈ "AIR" + 12 chars  → 15 total  (ej. AIR2618261VYFJV)
  //   Child AIR   = master + "-" + 3 dígitos     (ej. AIR2618261VYFJV-001)
  if (code.startsWith('LOG')) {
    // 18 chars totales = master(14) + 4 dígitos child
    const log4 = code.match(/^(LOG[A-Z0-9]{11,})(\d{4})$/);
    if (log4 && code.length >= 18) return `${log4[1]}-${log4[2]}`;
    // 16 chars totales = master(14) + 2 dígitos child
    const log2 = code.match(/^(LOG[A-Z0-9]{11,})(\d{2})$/);
    if (log2 && code.length >= 16) return `${log2[1]}-${log2[2]}`;
    return code; // master solo (≤ 15 chars): pass-through
  }
  if (code.startsWith('AIR')) {
    // ≥ 17 chars = master(≥14) + 3 dígitos child
    const air3 = code.match(/^(AIR[A-Z0-9]+?[A-Z])(\d{3})$/);
    if (air3 && code.length >= 17) return `${air3[1]}-${air3[2]}`;
    return code; // master solo: pass-through
  }
  if (code.startsWith('DHL')) {
    const dhl = code.match(/^(DHL[A-Z0-9]+?[A-Z])(\d{2,4})$/);
    if (dhl && code.length >= 14) return `${dhl[1]}-${dhl[2]}`;
    return code;
  }

  // Fallback histórico para PO Box / CN: prefijo de 2 letras + resto.
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
  // Masters (AIR/LOG) que el chofer expandió para ver sus 62/40 hijas.
  // Por defecto colapsados — solo se muestra una línea por embarque.
  const [expandedMasters, setExpandedMasters] = useState<Set<string>>(new Set());
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
  // Detector de ritmo de tecleo: una pistola HID escribe a ~10ms/char,
  // un humano teclea a >120ms/char. Mantenemos los últimos delays para
  // decidir si fue scan o tecleo manual y NO auto-enviar al humano.
  const lastInputTimeRef = useRef<number>(0);
  const recentDelaysRef = useRef<number[]>([]);

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
  // PERO sólo auto-enviamos si el ritmo de entrada es de pistola (chars
  // separados <80ms entre sí). Cuando el operador teclea a mano, los
  // delays son >120ms y no debemos atropellarlo enviando antes de tiempo.
  const handleScannerInputChange = (raw: string) => {
    const now = Date.now();
    const prev = lastInputTimeRef.current;
    if (prev > 0) {
      const delta = now - prev;
      // Mantenemos sólo las últimas 4 deltas para no acumular historial viejo.
      recentDelaysRef.current.push(delta);
      if (recentDelaysRef.current.length > 4) {
        recentDelaysRef.current.shift();
      }
    }
    lastInputTimeRef.current = now;
    // Si el campo se vacía (después de submit), reseteamos el detector.
    if (raw.length === 0) {
      recentDelaysRef.current = [];
      lastInputTimeRef.current = 0;
    }

    setManualCode(raw);

    if (autoSubmitTimer.current) {
      clearTimeout(autoSubmitTimer.current);
      autoSubmitTimer.current = null;
    }

    const normalized = normalizeScanCode(raw);
    // Solo auto-enviar si parece un tracking razonable (>=8 chars, alfanumérico)
    if (!normalized || normalized.length < 8) return;

    // Heurística pistola vs teclado: necesitamos ≥3 deltas y promedio <80ms.
    const deltas = recentDelaysRef.current;
    const looksLikeScanner =
      deltas.length >= 3 &&
      deltas.reduce((s, d) => s + d, 0) / deltas.length < 80;
    if (!looksLikeScanner) return;

    autoSubmitTimer.current = setTimeout(async () => {
      if (isScanning) return;
      const code = normalizeScanCode(raw);
      if (!code) return;
      setManualCode('');
      recentDelaysRef.current = [];
      lastInputTimeRef.current = 0;
      await processScanCode(code, 'scanner');
    }, 250);
  };

  const totalPackages = routeData 
    ? routeData.pendingToLoad + routeData.loadedToday 
    : 0;

  const normalizePositiveInt = (value: any, fallback: number): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  };

  // Agrupa los paquetes por master tracking (LOG26CNMX00077-0001 →
  // master "LOG26CNMX00077"). Los servicios sin master (DHL / POBOX
  // sueltos) se exhiben como grupos de 1 para mantener la lista uniforme.
  // Cada grupo muestra cuántas hijas están cargadas vs pendientes, y al
  // expandir muestra las hijas individuales con su check correspondiente.
  type MasterGroup = {
    masterKey: string;
    isVirtualMaster: boolean;
    pending: PackageItem[];
    loaded: PackageItem[];
    representative: PackageItem;
  };
  const extractMasterKey = (tracking: string): { master: string; isMulti: boolean } => {
    const tn = String(tracking || '').toUpperCase();
    // LOG/AIR/DHL con sufijo -NNNN
    const m = tn.match(/^([A-Z]{2,3}[A-Z0-9]+)-\d{1,4}$/);
    if (m) return { master: m[1] as string, isMulti: true };
    return { master: tn, isMulti: false };
  };
  const groupPackagesByMaster = (
    pending: PackageItem[],
    loaded: PackageItem[],
  ): MasterGroup[] => {
    const map = new Map<string, MasterGroup>();
    const ensure = (pkg: PackageItem): MasterGroup => {
      const { master, isMulti } = extractMasterKey(pkg.tracking_number);
      let g = map.get(master);
      if (!g) {
        g = {
          masterKey: master,
          isVirtualMaster: isMulti,
          pending: [],
          loaded: [],
          representative: pkg,
        };
        map.set(master, g);
      }
      return g;
    };
    for (const p of pending) ensure(p).pending.push(p);
    for (const p of loaded) ensure(p).loaded.push(p);
    // Ordenar hijas por sufijo numérico para que -0001 venga antes que -0010.
    for (const g of map.values()) {
      const bySuffix = (a: PackageItem, b: PackageItem) => {
        const na = Number(String(a.tracking_number).match(/-(\d+)$/)?.[1] || 0);
        const nb = Number(String(b.tracking_number).match(/-(\d+)$/)?.[1] || 0);
        return na - nb;
      };
      g.pending.sort(bySuffix);
      g.loaded.sort(bySuffix);
    }
    // Mostrar primero los grupos con más pendientes.
    return Array.from(map.values()).sort((a, b) => b.pending.length - a.pending.length);
  };
  const toggleMasterExpanded = (key: string) => {
    setExpandedMasters(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const getClientPackageInfo = (pkg: PackageItem) => {
    const boxNumber = normalizePositiveInt(pkg.box_number, 1);
    const totalBoxes = normalizePositiveInt(pkg.total_boxes, Math.max(boxNumber, 1));
    const clientNumber = String(pkg.client_number || '').trim() || 'N/D';

    const fromHint = String(pkg.reference_hint || '').match(/\d+/g)?.join('') || '';
    const fromTrackingGroup = String(pkg.tracking_number || '').match(/(\d+)-\d+$/)?.[1] || '';
    const fromTrackingAny = String(pkg.tracking_number || '').match(/\d+/g)?.join('') || '';

    // Priorizar referencia explícita (shipping mark / reference_code).
    // Evitar tomar valores de 1 dígito que suelen ser ruido.
    const normalizedHint = fromHint.length >= 2 ? fromHint : '';
    const normalizedTrackingGroup = fromTrackingGroup.length >= 2 ? fromTrackingGroup : '';
    const normalizedTrackingAny = fromTrackingAny.length >= 2 ? fromTrackingAny : '';
    const referenceDigits = normalizedHint || normalizedTrackingGroup || normalizedTrackingAny || 'N/D';

    return {
      clientNumber,
      referenceDigits,
      boxLabel: `${Math.min(boxNumber, totalBoxes)}/${totalBoxes} cajas`,
    };
  };
    
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
            {/* Header corporativo: barra de color + icono + cierre */}
            <View style={styles.errorModalHeaderBar}>
              <View style={styles.errorModalHeaderIconWrap}>
                <MaterialIcons
                  name={errorDetail?.type === 'warning' ? 'warning' : 'error-outline'}
                  size={26}
                  color="#fff"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.errorModalHeaderTitle}>No se puede cargar</Text>
                <Text style={styles.errorModalHeaderSubtitle}>Detalle del rechazo</Text>
              </View>
              <TouchableOpacity onPress={() => setErrorDetail(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialIcons name="close" size={24} color="rgba(255,255,255,0.9)" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12 }}>
              {/* Motivo principal */}
              {errorDetail?.message ? (
                <View style={styles.errorModalReasonBox}>
                  <Text style={styles.errorModalReasonText}>
                    {String(errorDetail.message).replace(/[⚠️✅❌📦⛔ℹ️]/g, '').trim() || errorDetail.message}
                  </Text>
                </View>
              ) : null}

              {/* Pills de estado: pago, etiqueta, instrucciones */}
              {(typeof errorDetail?.errorData?.isPaid === 'boolean' ||
                typeof errorDetail?.errorData?.hasPrintedLabel === 'boolean' ||
                typeof errorDetail?.errorData?.hasInstructions === 'boolean') ? (
                <View style={styles.errorModalPillsRow}>
                  {typeof errorDetail?.errorData?.isPaid === 'boolean' ? (
                    <View style={[styles.errorModalPill, errorDetail.errorData.isPaid ? styles.errorModalPillOk : styles.errorModalPillFail]}>
                      <MaterialIcons name={errorDetail.errorData.isPaid ? 'check-circle' : 'cancel'} size={18} color={errorDetail.errorData.isPaid ? '#2E7D32' : '#C62828'} />
                      <Text style={[styles.errorModalPillText, { color: errorDetail.errorData.isPaid ? '#2E7D32' : '#C62828' }]}>Pago</Text>
                    </View>
                  ) : null}
                  {typeof errorDetail?.errorData?.hasPrintedLabel === 'boolean' ? (
                    <View style={[styles.errorModalPill, errorDetail.errorData.hasPrintedLabel ? styles.errorModalPillOk : styles.errorModalPillFail]}>
                      <MaterialIcons name={errorDetail.errorData.hasPrintedLabel ? 'check-circle' : 'cancel'} size={18} color={errorDetail.errorData.hasPrintedLabel ? '#2E7D32' : '#C62828'} />
                      <Text style={[styles.errorModalPillText, { color: errorDetail.errorData.hasPrintedLabel ? '#2E7D32' : '#C62828' }]}>Etiqueta</Text>
                    </View>
                  ) : null}
                  {typeof errorDetail?.errorData?.hasInstructions === 'boolean' ? (
                    <View style={[styles.errorModalPill, errorDetail.errorData.hasInstructions ? styles.errorModalPillOk : styles.errorModalPillFail]}>
                      <MaterialIcons name={errorDetail.errorData.hasInstructions ? 'check-circle' : 'cancel'} size={18} color={errorDetail.errorData.hasInstructions ? '#2E7D32' : '#C62828'} />
                      <Text style={[styles.errorModalPillText, { color: errorDetail.errorData.hasInstructions ? '#2E7D32' : '#C62828' }]}>Instrucciones</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* Código escaneado destacado */}
              {errorDetail?.scannedCode ? (
                <View style={styles.errorModalDetailRow}>
                  <Text style={styles.errorModalFieldLabel}>Código escaneado</Text>
                  <View style={styles.errorModalCodeChip}>
                    <MaterialIcons name="qr-code-2" size={16} color="#F05A28" />
                    <Text style={styles.errorModalCodeChipText}>{errorDetail.scannedCode}</Text>
                  </View>
                </View>
              ) : null}

              {/* Detalles secundarios (sólo si vienen del backend) */}
              {errorDetail?.errorData?.currentStatus ? (
                <View style={styles.errorModalDetailRow}>
                  <Text style={styles.errorModalFieldLabel}>Estado actual</Text>
                  <Text style={styles.errorModalFieldValue}>{String(errorDetail.errorData.currentStatus)}</Text>
                </View>
              ) : null}

              {errorDetail?.errorData?.assignedTo ? (
                <View style={styles.errorModalDetailRow}>
                  <Text style={styles.errorModalFieldLabel}>Asignado a</Text>
                  <Text style={styles.errorModalFieldValue}>{String(errorDetail.errorData.assignedTo)}</Text>
                </View>
              ) : null}

              {errorDetail?.errorData?.loadedAt ? (
                <View style={styles.errorModalDetailRow}>
                  <Text style={styles.errorModalFieldLabel}>Cargado el</Text>
                  <Text style={styles.errorModalFieldValue}>{new Date(errorDetail.errorData.loadedAt).toLocaleString('es-MX')}</Text>
                </View>
              ) : null}

              {/* Hint del backend (texto explicativo extra) */}
              {errorDetail?.errorData?.hint ? (
                <View style={styles.errorModalHintBox}>
                  <MaterialIcons name="lightbulb" size={18} color="#F57C00" />
                  <Text style={styles.errorModalHintText}>{String(errorDetail.errorData.hint)}</Text>
                </View>
              ) : null}
            </ScrollView>

            <TouchableOpacity
              style={styles.errorModalCloseBtn}
              onPress={() => setErrorDetail(null)}
            >
              <Text style={styles.errorModalCloseText}>Entendido</Text>
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
          
          {/* Lista agrupada por embarque master (LOG/AIR). DHL/PO Box
              que no tienen master se muestran como grupos de 1. */}
          {(() => {
            const groups = groupPackagesByMaster(
              routeData?.pendingPackages || [],
              routeData?.loadedPackages || [],
            );
            const totalPending = routeData?.pendingPackages.length || 0;
            const totalLoaded = routeData?.loadedPackages.length || 0;
            return (
              <>
                <View style={styles.tabContainer}>
                  <Text style={styles.tabTitle}>
                    {groups.length} embarque(s) · {totalLoaded}/{totalPending + totalLoaded} cargados
                  </Text>
                </View>
                <FlatList
                  data={groups}
                  keyExtractor={(g) => g.masterKey}
                  renderItem={({ item: group }) => {
                    const svcIcon = getServiceIcon(group.representative.tracking_number);
                    const total = group.pending.length + group.loaded.length;
                    const allLoaded = group.pending.length === 0;
                    const expanded = expandedMasters.has(group.masterKey);
                    const headerInfo = getClientPackageInfo(group.representative);
                    // Para grupos de 1 caja (DHL / POBOX) no mostramos el
                    // botón de expandir — la fila ya es la guía individual.
                    const isSingleton = total === 1 && !group.isVirtualMaster;
                    return (
                      <View>
                        <TouchableOpacity
                          style={[styles.packageItem, allLoaded && styles.packageLoaded]}
                          onPress={() => !isSingleton && toggleMasterExpanded(group.masterKey)}
                          activeOpacity={isSingleton ? 1 : 0.7}
                        >
                          <View style={styles.packageIcon}>
                            <MaterialIcons name={allLoaded ? 'check-circle' : svcIcon.name} size={24} color={allLoaded ? '#4CAF50' : svcIcon.color} />
                          </View>
                          <View style={styles.packageInfo}>
                            <Text style={styles.packageTracking}>{group.masterKey}</Text>
                            <Text style={styles.packageRecipient}>
                              🧾 Cliente: {headerInfo.clientNumber} · 🔢 Ref: {headerInfo.referenceDigits}
                              {group.isVirtualMaster ? ` · 📦 ${group.loaded.length}/${total} cajas` : ''}
                            </Text>
                            {!!group.representative.delivery_address && (
                              <Text style={styles.packageAddress} numberOfLines={1}>
                                {group.representative.delivery_address}
                              </Text>
                            )}
                            {!!group.representative.recipient_name && (
                              <Text style={styles.packageRecipient}>👤 {group.representative.recipient_name}</Text>
                            )}
                          </View>
                          <View style={styles.packageStatus}>
                            {!isSingleton && (
                              <MaterialIcons
                                name={expanded ? 'expand-less' : 'expand-more'}
                                size={28}
                                color={allLoaded ? '#4CAF50' : '#FF9800'}
                              />
                            )}
                            {isSingleton && (
                              <MaterialIcons
                                name={allLoaded ? 'check-circle' : 'hourglass-empty'}
                                size={20}
                                color={allLoaded ? '#4CAF50' : '#FF9800'}
                              />
                            )}
                          </View>
                        </TouchableOpacity>

                        {/* Detalle expandible: hijas con check / pendiente */}
                        {expanded && !isSingleton && (
                          <View style={{ backgroundColor: '#fafafa', paddingVertical: 4 }}>
                            {[...group.loaded, ...group.pending].map((child) => {
                              const isLoaded = group.loaded.some((c) => c.id === child.id);
                              const suffix = String(child.tracking_number).match(/-(\d+)$/)?.[1] || '';
                              return (
                                <View
                                  key={child.id}
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    paddingVertical: 8,
                                    paddingHorizontal: 24,
                                    borderTopWidth: 1,
                                    borderTopColor: '#eee',
                                  }}
                                >
                                  <MaterialIcons
                                    name={isLoaded ? 'check-circle' : 'radio-button-unchecked'}
                                    size={20}
                                    color={isLoaded ? '#4CAF50' : '#bbb'}
                                    style={{ marginRight: 10 }}
                                  />
                                  <Text
                                    style={{
                                      flex: 1,
                                      fontSize: 13,
                                      color: isLoaded ? '#4CAF50' : '#333',
                                      textDecorationLine: isLoaded ? 'line-through' : 'none',
                                      fontWeight: isLoaded ? '500' : '600',
                                    }}
                                  >
                                    {suffix ? `Caja #${suffix}` : child.tracking_number}
                                  </Text>
                                  <Text style={{ fontSize: 11, color: '#888' }}>
                                    {child.tracking_number}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    );
                  }}
                  ListEmptyComponent={
                    <View style={styles.emptyList}>
                      <MaterialIcons name="check-circle" size={48} color="#4CAF50" />
                      <Text style={styles.emptyText}>Todos los paquetes han sido cargados</Text>
                    </View>
                  }
                />
              </>
            );
          })()}
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
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  errorModalHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F05A28',
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 12,
  },
  errorModalHeaderIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorModalHeaderTitle: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 17,
    letterSpacing: 0.2,
  },
  errorModalHeaderSubtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    marginTop: 2,
  },
  errorModalReasonBox: {
    backgroundColor: '#FFF4EE',
    borderLeftWidth: 4,
    borderLeftColor: '#F05A28',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  errorModalReasonText: {
    fontSize: 15,
    lineHeight: 21,
    color: '#3A2418',
    fontWeight: '500',
  },
  errorModalPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  errorModalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    gap: 5,
  },
  errorModalPillOk: {
    backgroundColor: '#E8F5E9',
    borderColor: '#A5D6A7',
  },
  errorModalPillFail: {
    backgroundColor: '#FFEBEE',
    borderColor: '#EF9A9A',
  },
  errorModalPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  errorModalDetailRow: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  errorModalFieldLabel: {
    fontSize: 11,
    color: '#999',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  errorModalFieldValue: {
    fontSize: 14,
    color: '#222',
    fontWeight: '500',
  },
  errorModalCodeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFF4EE',
    borderColor: '#F05A28',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  errorModalCodeChipText: {
    color: '#F05A28',
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
  },
  errorModalHintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
  },
  errorModalHintText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#5D4037',
  },
  errorModalCloseBtn: {
    backgroundColor: '#F05A28',
    paddingVertical: 14,
    alignItems: 'center',
  },
  errorModalCloseText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.3,
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
