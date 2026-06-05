/**
 * DeliveryConfirmScreen - Confirmación de Entrega
 * 
 * Funcionalidad:
 * - Escanear paquete a entregar
 * - Capturar firma del cliente
 * - Tomar foto de evidencia
 * - Confirmar entrega con todos los datos
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Vibration,
  Animated,
  TextInput,
  Image,
  ScrollView,
  Keyboard,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import api from '../services/api';
import { enqueueDelivery, isNetworkError } from '../services/deliveryQueue';
import SignatureScreen from 'react-native-signature-canvas';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

// Configurar sesión de audio para mezclar con cámara iOS (evita que la cámara bloquee los sonidos)
setAudioModeAsync({ playsInSilentModeIOS: true, shouldRouteThroughEarpiece: false }).catch(() => {});

// Sonidos pre-cargados (success/error)
const successPlayer = createAudioPlayer(require('../../assets/sounds/success.wav'));
const errorPlayer = createAudioPlayer(require('../../assets/sounds/error.wav'));
const playSuccess = () => { try { successPlayer.seekTo(0); successPlayer.play(); } catch {} };
const playError = () => { try { errorPlayer.seekTo(0); errorPlayer.play(); } catch {} };

interface PackageInfo {
  id: number;
  tracking_number: string;
  recipient_name: string;
  delivery_address: string;
  delivery_city: string;
  national_tracking?: string;
  carrier_service_request_code?: string;
  national_carrier?: string;
  requires_carrier_scan?: boolean;
  has_children?: boolean;
  child_guides?: string[];
}

type Step = 'scan' | 'signature' | 'photo' | 'confirm';
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

  // Algunos lectores QR (con layout no inglés) reemplazan ":" por "Ñ" y "/" por "-",
  // dejando algo como: "httpsÑ--app.entregax.com-track-US'2597331374'0002"
  // Detectar segmento "track-" o "track/" y tomar lo que viene después.
  const fromTrackDash = code.match(/track[\/\-_:]+([A-Za-z0-9'\-_]+)/i);
  if (fromTrackDash?.[1]) {
    code = fromTrackDash[1];
  }

  const fromQuery = code.match(/[?&](?:track|tracking|barcode|code)=([^&#\s]+)/i);
  if (fromQuery?.[1]) {
    code = fromQuery[1];
  }

  code = code
    .replace(/[_']/g, '-')
    .replace(/\s+/g, '')
    .toUpperCase();

  // Detectar guías FedEx de 34 dígitos puros y extraer últimos 12
  if (/^\d{34}$/.test(code)) {
    return code.slice(-12); // Últimos 12 dígitos
  }

  // Normalizar sufijo numérico corto a 4 dígitos: US-2609131174-02 → US-2609131174-0002
  const shortSuffix = code.match(/^([A-Z]{2,}-[A-Z0-9]+-)(0*\d{1,3})$/);
  if (shortSuffix) {
    return `${shortSuffix[1]}${shortSuffix[2].padStart(4, '0')}`;
  }

  // US compacto sin guiones: US + 10 dígitos base + 1-4 dígitos sufijo (con o sin padding)
  // US260913117402 (12 dígitos) → US-2609131174-0002
  // US260913117400002 (14 dígitos) → US-2609131174-0002
  if (/^US\d{11,14}$/.test(code)) {
    const digits = code.slice(2);
    const base = digits.slice(0, 10);
    const suffix = digits.slice(10);
    return `US-${base}-${suffix.padStart(4, '0')}`;
  }
  if (/^US\d{10}$/.test(code)) {
    return `US-${code.slice(2, 12)}`;
  }

  // Preservar códigos que ya tienen formato XX-XXXXX... (guías internas)
  const canonicalTracking = code.match(/^[A-Z]{2,}-[A-Z0-9]{2,}(?:-[A-Z0-9]{2,})*$/);
  if (canonicalTracking?.[0]) {
    return canonicalTracking[0];
  }

  // Preservar códigos alfanuméricos largos (guías Paquete Express de 20 dígitos)
  if (/^[A-Z0-9]{14,}$/.test(code)) {
    return code;
  }

  // Intentar convertir formato compacto XX0000... a XX-0000...
  const compactTrackingDigits = code.match(/^([A-Z]{2,})(\d{4,})$/);
  if (compactTrackingDigits?.[0]) {
    return `${compactTrackingDigits[1]}-${compactTrackingDigits[2]}`;
  }

  return code;
};

// Función para extraer guía master y números extra de una guía múltiple
const extractMasterGuide = (scannedCode: string): { masterGuide: string; extraNumbers: string } => {
  // Las guías de Paquete Express pueden ser:
  // - 14 dígitos: ej. XXXXXXXXXXXXX
  // - 20 dígitos: ej. MTY01WE0A18289004003 (14 base + 6 extra)
  // Detecta patrones como: MTY01WE0A18289004003
  // Donde MTY01WE0A18289 (14 chars) es la guía master y 004003 (6 digits) son números extra
  const match = scannedCode.match(/^([A-Z0-9]{14})(\d{6})$/);
  if (match) {
    return { masterGuide: match[1], extraNumbers: match[2] };
  }
  
  // Si tiene exactamente 14 caracteres, es una guía completa sin números extra
  if (scannedCode.length === 14) {
    return { masterGuide: scannedCode, extraNumbers: '' };
  }
  
  return { masterGuide: scannedCode, extraNumbers: '' };
};

export default function DeliveryConfirmScreen({ navigation, route }: any) {
  const preSelectedPackage = route?.params?.package;
  const token = route?.params?.token;
  const initialScanMode: ScanMode = route?.params?.scanMode === 'scanner' ? 'scanner' : 'camera';
  // Paquetes ya cargados en camioneta — pasados desde DriverHomeScreen para match local rápido
  const cachedLoadedPackages: any[] = route?.params?.loadedPackages || [];
  
  const [currentStep, setCurrentStep] = useState<Step>(preSelectedPackage ? 'signature' : 'scan');
  const [loading, setLoading] = useState(false);
  const [packageInfo, setPackageInfo] = useState<PackageInfo | null>(preSelectedPackage || null);
  const [scannerActive, setScannerActive] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const isScanningRef = useRef(false); // guard síncrono para evitar doble scan
  const [tapArmed, setTapArmed] = useState(false);
  const tapArmedRef = useRef(false);   // ref síncrono para la cámara — desarma inmediatamente al primer frame
  const tapArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showBatchSummaryModal, setShowBatchSummaryModal] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState('');
  const [scanMode, setScanMode] = useState<ScanMode>(initialScanMode);
  const [manualCode, setManualCode] = useState('');
  
  // Datos de entrega
  const [signature, setSignature] = useState<string>('');
  const [photo, setPhoto] = useState<string>('');
  const [recipientName, setRecipientName] = useState('');
  const [notes, setNotes] = useState('');
  const [carrierGuideCode, setCarrierGuideCode] = useState('');
  const [carrierGuideVerified, setCarrierGuideVerified] = useState(false);
  const [showCarrierGuideCamera, setShowCarrierGuideCamera] = useState(false);
  const [isCarrierGuideScanning, setIsCarrierGuideScanning] = useState(false);

  // Lote de cajas adicionales que se entregan con la MISMA firma/foto/nombre (entrega local)
  const [batchPackages, setBatchPackages] = useState<PackageInfo[]>([]);
  const [addingToBatch, setAddingToBatch] = useState(false);
  const addingToBatchRef = useRef(false); // ref síncrono para captura correcta en useCallback

  const [permission, requestPermission] = useCameraPermissions();
  const signatureRef = useRef<any>(null);
  const feedbackOpacity = useRef(new Animated.Value(0)).current;
  const [feedback, setFeedback] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const hasAskedModeRef = useRef(false);
  const manualInputRef = useRef<TextInput | null>(null);
  const carrierGuideInputRef = useRef<TextInput | null>(null);

  const showFeedback = (fb: {type: 'success' | 'error', message: string}) => {
    setFeedback(fb);
    if (fb.type === 'success') playSuccess(); else playError();
    Animated.sequence([
      Animated.timing(feedbackOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(feedbackOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setFeedback(null));
  };

  useEffect(() => {
    if (currentStep === 'scan' && !route?.params?.scanMode && !hasAskedModeRef.current) {
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
  }, [currentStep, route?.params?.scanMode]);

  useEffect(() => {
    if (currentStep !== 'scan') return;
    if (scanMode === 'scanner') {
      setScannerActive(false);
      setTimeout(() => manualInputRef.current?.focus(), 150);
    } else {
      setScannerActive(true);
    }
  }, [scanMode, currentStep]);

  useEffect(() => {
    if (currentStep !== 'signature' || !packageInfo?.requires_carrier_scan || showCarrierGuideCamera) {
      return;
    }

    if (scanMode === 'scanner') {
      Keyboard.dismiss();
    }

    const timer = setTimeout(() => {
      carrierGuideInputRef.current?.focus();
    }, 180);

    return () => clearTimeout(timer);
  }, [currentStep, packageInfo?.requires_carrier_scan, showCarrierGuideCamera, scanMode]);

  // Extrae el prefijo master: US-2609131174-0001 → US-2609131174
  const getMasterPrefix = (tracking: string) => tracking.replace(/-\d{4}$/, '');

  const processScanCode = useCallback(async (rawCode: string, source: 'camera' | 'scanner' = 'camera') => {
    const data = normalizeScanCode(rawCode);
    if (!data || isScanningRef.current) return; // ref síncrono evita doble-scan
    if (source === 'camera' && (!scannerActive || data === lastScannedCode)) return;
    isScanningRef.current = true; // bloquear inmediatamente (síncrono)
    // Mostrar la guía siendo validada en el input mientras espera respuesta
    setManualCode(data);

    // Flujo normal de entrega individual
    setIsScanning(true);
    if (source === 'camera') setScannerActive(false);
    setLastScannedCode(data);

    try {
      // ── Búsqueda LOCAL primero (paquetes ya cargados en camioneta) ──────────────
      const dataUpper = data.toUpperCase().replace(/-/g, '');
      const localMatch = cachedLoadedPackages.find((p: any) => {
        const t = String(p.tracking_number || '').toUpperCase().replace(/-/g, '');
        return t === dataUpper || t.startsWith(dataUpper) || dataUpper.startsWith(t);
      });

      if (localMatch && !localMatch.national_carrier?.trim()) {
        // Paquete local encontrado en caché — sin llamada al backend
        const newPkg: PackageInfo = {
          id: localMatch.id,
          tracking_number: localMatch.tracking_number,
          recipient_name: localMatch.recipient_name || '',
          delivery_address: localMatch.delivery_address || '',
          delivery_city: localMatch.delivery_city || '',
          national_tracking: localMatch.national_tracking || '',
          national_carrier: localMatch.national_carrier || '',
          requires_carrier_scan: false,
          has_children: false,
          child_guides: [],
        };
        Vibration.vibrate(100);

        // Si estamos en modo "agregar caja al lote", agregar al batch en lugar de reemplazar
        if (packageInfo && addingToBatchRef.current) {
          const masterMain = getMasterPrefix(packageInfo.tracking_number);
          const masterNew = getMasterPrefix(newPkg.tracking_number);
          if (masterMain !== masterNew) {
            Vibration.vibrate([0, 300, 100, 300]);
            showFeedback({ type: 'error', message: `⛔ ${newPkg.tracking_number} es de otro embarque (${masterNew}). Solo puedes agregar cajas del mismo master: ${masterMain}` });
            return;
          }
          const allTrackings = [packageInfo.tracking_number, ...batchPackages.map(p => p.tracking_number)];
          if (allTrackings.includes(newPkg.tracking_number)) {
            Vibration.vibrate([0, 200, 100, 200]);
            showFeedback({ type: 'error', message: `❌ La caja ${newPkg.tracking_number} ya está en este lote.` });
          } else {
            setBatchPackages(prev => [...prev, newPkg]);
            showFeedback({ type: 'success', message: `✅ Caja ${newPkg.tracking_number} agregada. Escanea la siguiente o presiona Ver guías.` });
            setManualCode('');
          }
          return;
        }

        setPackageInfo(newPkg);
        setRecipientName(newPkg.recipient_name || '');
        setCurrentStep('signature');
        setManualCode('');
        return;
      }

      // ── Fallback: verificar en backend ──────────────────────────────────────────
      const res = await api.get(`/api/driver/verify-package/${encodeURIComponent(data)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (res.data.success && res.data.package) {
        const newPkg = res.data.package;

        // Bloquear masters con hijas — deben escanearse caja por caja
        if (newPkg.has_children && newPkg.child_guides?.length > 0) {
          Vibration.vibrate([0, 300, 150, 300]);
          showFeedback({
            type: 'error',
            message: `⚠️ ${newPkg.tracking_number} tiene ${newPkg.child_guides.length} cajas. Escanea cada caja individual (-0001, -0002…)`,
          });
          return;
        }

        // Si el usuario presionó "+ Agregar otra caja", siempre agregar al lote
        if (packageInfo && addingToBatchRef.current) {
          // Validar que sea del mismo master
          const masterMain = getMasterPrefix(packageInfo.tracking_number);
          const masterNew = getMasterPrefix(newPkg.tracking_number);
          if (masterMain !== masterNew) {
            Vibration.vibrate([0, 300, 100, 300]);
            showFeedback({ type: 'error', message: `⛔ ${newPkg.tracking_number} es de otro embarque (${masterNew}). Solo cajas del mismo master: ${masterMain}` });
            return;
          }
          // Evitar duplicados
          const allTrackings = [packageInfo.tracking_number, ...batchPackages.map(p => p.tracking_number)];
          if (allTrackings.includes(newPkg.tracking_number)) {
            Vibration.vibrate([0, 200, 100, 200]);
            showFeedback({
              type: 'error',
              message: `❌ La caja ${newPkg.tracking_number} ya está en este lote.`,
            });
          } else {
            // Marcar como cargado y agregar al batch
            try {
              await api.post(`/api/driver/scan-load`, { barcode: data }, {
                headers: token ? { Authorization: `Bearer ${token}` } : undefined,
              });
            } catch (loadError: any) {
              console.warn('⚠️ No se pudo marcar como cargado:', loadError.response?.data?.error);
            }
            Vibration.vibrate(100);
            setBatchPackages(prev => [...prev, newPkg]);
            showFeedback({
              type: 'success',
              message: `✅ Caja ${newPkg.tracking_number} agregada. Escanea la siguiente o presiona Listo.`,
            });
            setManualCode('');
            // Quedarse en scan para permitir escaneo en serie
            // El usuario presiona "Listo" cuando termina
          }
        } else {
          // Marcar paquete como cargado (out_for_delivery) en el backend
          try {
            await api.post(`/api/driver/scan-load`, { barcode: data }, {
              headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            });
          } catch (loadError: any) {
            console.warn('⚠️ No se pudo marcar como cargado:', loadError.response?.data?.error);
          }

          Vibration.vibrate(100);
          setPackageInfo(newPkg);
          setRecipientName(newPkg.recipient_name || '');
          setCarrierGuideCode('');
          setCarrierGuideVerified(false);
          setCurrentStep('signature');
        }
      }
    } catch (error: any) {
      Vibration.vibrate([0, 200, 100, 200]);
      showFeedback({
        type: 'error',
        message: error.response?.data?.error || 'Paquete no encontrado o no asignado',
      });
    } finally {
      setManualCode('');
      isScanningRef.current = false;
      setTimeout(() => {
        setIsScanning(false);
        if (source === 'camera') setScannerActive(true);
        setLastScannedCode('');
      }, source === 'camera' ? 1500 : 500);
    }
  }, [scannerActive, lastScannedCode, token, packageInfo, batchPackages]);
  // Nota: addingToBatchRef.current se lee directamente del ref — siempre fresco, sin stale closure.

  const handleBarCodeScanned = useCallback(async (result: BarcodeScanningResult) => {
    if (!tapArmedRef.current) return; // check síncrono — rechaza todos los frames excepto el primero
    tapArmedRef.current = false;       // desarmar inmediatamente para que frames siguientes no pasen
    if (tapArmTimerRef.current) clearTimeout(tapArmTimerRef.current);
    setTapArmed(false);
    await processScanCode(result.data, 'camera');
  }, [processScanCode]);

  const handleManualSubmit = async () => {
    const code = normalizeScanCode(manualCode);
    if (!code) return;
    await processScanCode(code, 'scanner');
  };

  // Auto-submit cuando el input se llena por scanner QR (escribe rápido y se detiene).
  // Espera 1200ms de inactividad y mínimo 12 chars para evitar enviar guías truncadas.
  // Los lectores externos suelen agregar Enter al final, esto sólo es respaldo.
  useEffect(() => {
    if (!manualCode || manualCode.length < 12) return;
    if (isScanning) return;
    const t = setTimeout(() => {
      handleManualSubmit();
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualCode]);

  const handleSignatureEnd = () => {
    signatureRef.current?.readSignature();
  };

  const handleSignatureOK = (signatureData: string) => {
    setSignature(signatureData);
    // No avanzar automáticamente — el usuario debe presionar "Continuar"
    // para que pueda llenar el nombre antes de avanzar a foto
  };

  const handleSignatureClear = () => {
    signatureRef.current?.clearSignature();
  };

  const validateCarrierGuide = (rawCode?: string) => {
    if (!packageInfo?.national_tracking) {
      Alert.alert('Sin guía nacional', 'Este paquete no tiene guía nacional asignada para validar.');
      return;
    }

    const entered = normalizeScanCode(String(rawCode ?? carrierGuideCode));
    const expectedTracking = normalizeScanCode(String(packageInfo.national_tracking || ''));
    const expectedServiceRequest = normalizeScanCode(String(packageInfo.carrier_service_request_code || ''));
    const expectedCodes = [expectedTracking, expectedServiceRequest].filter(Boolean);

    if (!entered) {
      Alert.alert('Guía requerida', 'Escanea o escribe la guía de la paquetería para continuar.');
      return;
    }

    // Verificar validez exacta o con números extra (guía múltiple)
    let isValid = expectedCodes.includes(entered);
    let finalGuideCode = entered;
    let extraNumbers = '';

    // Si no coincide exactamente, verificar si es una guía múltiple
    if (!isValid) {
      const { masterGuide, extraNumbers: extra } = extractMasterGuide(entered);
      if (expectedCodes.includes(masterGuide)) {
        isValid = true;
        finalGuideCode = masterGuide;
        extraNumbers = extra;
      }
    }

    if (!isValid) {
      Vibration.vibrate([0, 200, 100, 200]);
      const expectedLabel = packageInfo.carrier_service_request_code
        ? `${packageInfo.national_tracking} / ${packageInfo.carrier_service_request_code}`
        : `${packageInfo.national_tracking}`;
      Alert.alert('Guía incorrecta', `El código escaneado no coincide. Esperado: ${expectedLabel}.`);
      return;
    }

    Vibration.vibrate(100);
    setCarrierGuideCode(finalGuideCode);
    setCarrierGuideVerified(true);
    setShowCarrierGuideCamera(false);
    
    // Si hay números extra, guardarlos en el estado o en packageInfo para luego usarlos
    if (extraNumbers) {
      console.log('Números extra de guía múltiple:', extraNumbers);
      // Aquí se pueden guardar en un estado si es necesario para mostrar luego
    }
    
    setCurrentStep('photo');
  };

  const handleOpenCarrierGuideCamera = async () => {
    if (!permission?.granted) {
      const request = await requestPermission();
      if (!request?.granted) {
        Alert.alert('Permiso requerido', 'Debes otorgar permiso de cámara para escanear la guía.');
        return;
      }
    }
    setShowCarrierGuideCamera(true);
  };

  const handleCarrierGuideScanned = (result: BarcodeScanningResult) => {
    if (isCarrierGuideScanning) return;
    setIsCarrierGuideScanning(true);
    validateCarrierGuide(result.data);
    setTimeout(() => setIsCarrierGuideScanning(false), 900);
  };

  const handleTakePhoto = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        const photoData = `data:image/jpeg;base64,${result.assets[0].base64}`;
        setPhoto(photoData);
        handleConfirmDelivery(photoData);
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudo tomar la foto');
    }
  };

  const handlePickFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para seleccionar una foto.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets[0].base64) {
        const photoData = `data:image/jpeg;base64,${result.assets[0].base64}`;
        setPhoto(photoData);
        handleConfirmDelivery(photoData);
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudo seleccionar la foto');
    }
  };

  const handleSkipPhoto = () => {
    handleConfirmDelivery('');
  };

  const handleConfirmDelivery = async (photoOverride?: string) => {
    if (!packageInfo) return;

    const trimmedRecipientName = recipientName.trim();
    const requiresCarrierScan = !!packageInfo?.requires_carrier_scan;

    if (!requiresCarrierScan && !trimmedRecipientName) {
      Alert.alert('Nombre requerido', 'Debes escribir el nombre de quien recibe antes de confirmar la entrega.');
      setCurrentStep('signature');
      return;
    }

    if (packageInfo?.requires_carrier_scan && !carrierGuideVerified) {
      Alert.alert('Validación requerida', 'Debes escanear la guía de paquetería asignada antes de confirmar la entrega.');
      setCurrentStep('signature');
      return;
    }

    const photoToUse = photoOverride !== undefined ? photoOverride : photo;
    setLoading(true);
    try {
      // Procesar paquete principal + cualquier caja del lote (todas con la misma firma/foto/nombre)
      const allPackages = [packageInfo, ...batchPackages];
      const deliveredOk: string[] = [];
      const deliveredErr: string[] = [];

      for (const pkg of allPackages) {
        try {
          const res = await api.post('/api/driver/confirm-delivery', {
            barcode: pkg.tracking_number,
            signatureBase64: signature,
            photoBase64: photoToUse,
            recipientName: requiresCarrierScan ? '' : trimmedRecipientName,
            notes: notes,
          }, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          });
          if (res.data?.success) {
            deliveredOk.push(pkg.tracking_number);
          } else {
            deliveredErr.push(`${pkg.tracking_number}: respuesta inesperada`);
          }
        } catch (e: any) {
          if (isNetworkError(e)) {
            // Sin internet → guardar en cola offline para sync posterior
            await enqueueDelivery({
              barcode: pkg.tracking_number,
              signatureBase64: signature,
              photoBase64: photoToUse,
              recipientName: requiresCarrierScan ? '' : trimmedRecipientName,
              notes: notes,
            });
            deliveredOk.push(pkg.tracking_number); // Contar como OK para UX
          } else {
            deliveredErr.push(`${pkg.tracking_number}: ${e.response?.data?.error || e.message || 'error'}`);
          }
        }
      }

      if (deliveredOk.length > 0) {
        Vibration.vibrate(100);
        const offlineCount = deliveredOk.length - (deliveredErr.length > 0 ? 0 : 0);
        showFeedback({
          type: 'success',
          message: `✅ ${deliveredOk.length} paquete(s) registrado(s)${offlineCount > 0 && !navigator.onLine ? ' (offline — se sincronizará)' : ''}`,
        });
        setTimeout(() => navigation.goBack(), 1500);
      } else {
        Alert.alert('Error', `No se pudo confirmar ninguna entrega:\n${deliveredErr.join('\n')}`);
      }
    } catch (error: any) {
      if (isNetworkError(error)) {
        const pkg = packageInfo;
        if (pkg) {
          await enqueueDelivery({
            barcode: pkg.tracking_number,
            signatureBase64: signature,
            photoBase64: photoToUse,
            recipientName: recipientName.trim(),
            notes: notes,
          });
          showFeedback({ type: 'success', message: '📶 Sin internet — entrega guardada para sync automático' });
          setTimeout(() => navigation.goBack(), 2000);
        }
      } else {
        Alert.alert('Error', error.response?.data?.error || 'No se pudo confirmar la entrega');
      }
    } finally {
      setLoading(false);
    }
  };

  // Renderizar paso actual
  const renderStep = () => {
    switch (currentStep) {
      case 'scan':
        return renderScanStep();
      case 'signature':
        return renderSignatureStep();
      case 'photo':
        return renderPhotoStep();
      case 'confirm':
        return renderConfirmStep();
    }
  };

  const handleCameraTap = () => {
    if (isScanningRef.current) return;
    if (tapArmTimerRef.current) clearTimeout(tapArmTimerRef.current);
    tapArmedRef.current = true;
    setTapArmed(true);
    setScannerActive(true);
    tapArmTimerRef.current = setTimeout(() => {
      tapArmedRef.current = false;
      setTapArmed(false);
    }, 1500);
  };

  const renderScanStep = () => {
    if (scanMode === 'camera' && !permission?.granted) {
      return (
        <View style={styles.centerContent}>
          <MaterialIcons name="camera-alt" size={64} color="#ccc" />
          <Text style={styles.permissionTitle}>Permiso de Cámara Requerido</Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Otorgar Permiso</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.stepContent}>
        {scanMode === 'camera' ? (
          // Cámara compacta: visor pequeño + botón "Scan" para activar
          <View style={styles.scannerInputCard}>
            {/* Visor compacto — solo muestra, NO escanea al tocar */}
            <View style={{ width: 220, height: 160, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000', alignSelf: 'center', marginBottom: 12 }}>
              <CameraView
                style={{ flex: 1 }}
                barcodeScannerSettings={{ barcodeTypes: ['code128', 'code39', 'qr', 'ean13', 'ean8'] }}
                onBarcodeScanned={tapArmed ? handleBarCodeScanned : undefined}
              />
              {/* Esquinas del frame */}
              <View style={StyleSheet.absoluteFillObject}>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                  <View style={{ width: 140, height: 90, position: 'relative' }}>
                    <View style={[styles.corner, styles.topLeft, tapArmed && { borderColor: '#F05A28' }]} />
                    <View style={[styles.corner, styles.topRight, tapArmed && { borderColor: '#F05A28' }]} />
                    <View style={[styles.corner, styles.bottomLeft, tapArmed && { borderColor: '#F05A28' }]} />
                    <View style={[styles.corner, styles.bottomRight, tapArmed && { borderColor: '#F05A28' }]} />
                  </View>
                </View>
              </View>
              {/* Overlay estado */}
              <View style={{ position: 'absolute', bottom: 6, left: 0, right: 0, alignItems: 'center' }}>
                {isScanning ? (
                  <View style={{ backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', gap: 5, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>{lastScannedCode || 'Verificando...'}</Text>
                  </View>
                ) : tapArmed ? (
                  <View style={{ backgroundColor: 'rgba(240,90,40,0.9)', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>📡 Escaneando...</Text>
                  </View>
                ) : (
                  <View style={{ backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ color: '#fff', fontSize: 11 }}>Apunta al código y presiona Scan</Text>
                  </View>
                )}
              </View>
            </View>

            <MaterialIcons name="photo-camera" size={32} color="#F05A28" />
            <Text style={styles.scannerInputTitle}>Modo Cámara</Text>
            <Text style={styles.scannerInputSubtitle}>Presiona Scan para leer el código.</Text>
            <TextInput
              ref={manualInputRef}
              style={styles.scannerInput}
              placeholder="O escribe el código manualmente"
              value={manualCode}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="send"
              showSoftInputOnFocus={true}
              blurOnSubmit={false}
              onChangeText={setManualCode}
              onSubmitEditing={handleManualSubmit}
            />
            <TouchableOpacity
              style={[styles.manualSubmitButton, (isScanning || tapArmed) && styles.buttonDisabled]}
              onPress={manualCode.trim() ? handleManualSubmit : handleCameraTap}
              disabled={isScanning || tapArmed}
            >
              {isScanning ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : tapArmed ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.manualSubmitText}>Escaneando...</Text>
                </>
              ) : (
                <>
                  <MaterialIcons name={manualCode.trim() ? 'check-circle' : 'photo-camera'} size={20} color="#fff" />
                  <Text style={styles.manualSubmitText}>{manualCode.trim() ? 'Validar' : 'Scan'}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.scannerInputCard}>
            <MaterialIcons name="qr-code-scanner" size={52} color="#F05A28" />
            <Text style={styles.scannerInputTitle}>Modo Escáner</Text>
            <Text style={styles.scannerInputSubtitle}>
              Usa lector externo o escribe la guía manualmente.
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
              style={[styles.manualSubmitButton, isScanning && styles.buttonDisabled]}
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

        {/* Botón "Ver guías · Terminar" — visible en ambos modos (cámara y escáner) */}
        {packageInfo && batchPackages.length > 0 && (
          <TouchableOpacity
            style={{ marginTop: 12, backgroundColor: '#F05A28', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            onPress={() => setShowBatchSummaryModal(true)}
          >
            <MaterialIcons name="visibility" size={20} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
              Ver · {1 + batchPackages.length} guías · Terminar
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderSignatureStep = () => (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={100}
    >
    <View style={styles.stepContent}>
      {/* Info del paquete + badge de total de guías en el lote */}
      <View style={styles.packageInfoBox}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Text style={[styles.packageInfoTracking, { flex: 1 }]}>{packageInfo?.tracking_number}</Text>
          {batchPackages.length > 0 && (
            <View style={{ backgroundColor: '#F05A28', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                📦 {1 + batchPackages.length} guías
              </Text>
            </View>
          )}
        </View>
        {!!packageInfo?.delivery_address && packageInfo.delivery_address !== 'Pendiente de asignar' && (
          <Text style={styles.packageInfoAddress} numberOfLines={2}>
            📍 {packageInfo.delivery_address}
          </Text>
        )}
        {!!packageInfo?.recipient_name && (
          <Text style={styles.packageInfoRecipient}>
            👤 {packageInfo.recipient_name}
          </Text>
        )}
      </View>


      {/* Botón para agregar otra caja al mismo lote — solo si la guía tiene sufijo hijo (-0001, -0002…) */}
      {!packageInfo?.requires_carrier_scan && /^[A-Z]{2,}-[A-Z0-9]+-\d{4}$/.test(packageInfo?.tracking_number || '') && (
        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#fff',
            borderWidth: 1.5,
            borderColor: '#F05A28',
            borderStyle: 'dashed',
            borderRadius: 8,
            paddingVertical: 10,
            marginBottom: 12,
            gap: 6,
          }}
          onPress={() => {
            setManualCode('');
            setLastScannedCode('');
            addingToBatchRef.current = true;
            setAddingToBatch(true);
            setCurrentStep('scan');
          }}
        >
          <MaterialIcons name="add-box" size={20} color="#F05A28" />
          <Text style={{ color: '#F05A28', fontWeight: '700' }}>
            + Agregar otra caja al mismo recibo
          </Text>
        </TouchableOpacity>
      )}

      {/* Área de firma */}
      <View style={styles.signatureContainer}>
        {packageInfo?.requires_carrier_scan ? (
          <>
            <Text style={styles.signatureLabel}>📦 Validar Guía de Paquetería</Text>
            <Text style={styles.carrierGuideSubtitle}>
              Escanea la guía de {packageInfo?.national_carrier || 'paquetería'} y valida que coincida.
            </Text>

            <View style={styles.carrierGuideExpectedBox}>
              <Text style={styles.carrierGuideExpectedLabel}>Guía asignada:</Text>
              <Text style={styles.carrierGuideExpectedValue}>{packageInfo?.national_tracking || 'N/A'}</Text>
              {!!packageInfo?.carrier_service_request_code && (
                <>
                  <Text style={[styles.carrierGuideExpectedLabel, { marginTop: 8 }]}>Solicitud de servicio:</Text>
                  <Text style={[styles.carrierGuideExpectedValue, styles.carrierGuideSecondaryValue]}>
                    {packageInfo.carrier_service_request_code}
                  </Text>
                </>
              )}
            </View>

            <TextInput
              ref={carrierGuideInputRef}
              style={styles.input}
              value={carrierGuideCode}
              onChangeText={(value) => {
                setCarrierGuideCode(value);
                if (carrierGuideVerified) setCarrierGuideVerified(false);
              }}
              placeholder="Escanea guía o solicitud de servicio"
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="send"
              showSoftInputOnFocus={scanMode === 'scanner' ? false : undefined}
              blurOnSubmit={false}
              onSubmitEditing={() => validateCarrierGuide()}
              onBlur={() => {
                if (currentStep === 'signature' && packageInfo?.requires_carrier_scan && !showCarrierGuideCamera) {
                  setTimeout(() => carrierGuideInputRef.current?.focus(), 80);
                }
              }}
            />

            <TouchableOpacity style={styles.openCarrierCameraButton} onPress={handleOpenCarrierGuideCamera}>
              <MaterialIcons name="photo-camera" size={20} color="#fff" />
              <Text style={styles.openCarrierCameraButtonText}>Usar cámara para escanear</Text>
            </TouchableOpacity>

            {showCarrierGuideCamera && (
              <View style={styles.carrierCameraWrapper}>
                <CameraView
                  style={styles.carrierCamera}
                  barcodeScannerSettings={{ barcodeTypes: ['code128', 'code39', 'qr', 'ean13', 'ean8'] }}
                  onBarcodeScanned={handleCarrierGuideScanned}
                />
                <TouchableOpacity style={styles.closeCarrierCameraButton} onPress={() => setShowCarrierGuideCamera(false)}>
                  <MaterialIcons name="close" size={18} color="#fff" />
                  <Text style={styles.closeCarrierCameraButtonText}>Cerrar cámara</Text>
                </TouchableOpacity>
              </View>
            )}

            {carrierGuideVerified && (
              <View style={styles.carrierGuideVerifiedBox}>
                <MaterialIcons name="check-circle" size={18} color="#2e7d32" />
                <Text style={styles.carrierGuideVerifiedText}>Guía validada correctamente</Text>
              </View>
            )}
          </>
        ) : (
          <>
            <Text style={styles.signatureLabel}>✍️ Firma del Receptor</Text>
            <View style={styles.signatureWrapper}>
              <SignatureScreen
                ref={signatureRef}
                onOK={handleSignatureOK}
                onEnd={handleSignatureEnd}
                descriptionText=""
                clearText="Borrar"
                confirmText="Aceptar"
                webStyle={`
                  .m-signature-pad { box-shadow: none; border: none; }
                  .m-signature-pad--body { border: 1px solid #ddd; border-radius: 8px; }
                  .m-signature-pad--footer { display: none; }
                `}
              />
            </View>

            <View style={styles.signatureActions}>
              <TouchableOpacity
                style={styles.signatureClearBtn}
                onPress={handleSignatureClear}
              >
                <MaterialIcons name="refresh" size={20} color="#666" />
                <Text style={styles.signatureClearText}>Borrar</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Input nombre del receptor (solo entrega local) */}
      {!packageInfo?.requires_carrier_scan && (
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Nombre de quien recibe:</Text>
          <TextInput
            style={styles.input}
            value={recipientName}
            onChangeText={setRecipientName}
            placeholder="Nombre completo"
            autoCapitalize="words"
          />
        </View>
      )}

      {/* Notas adicionales (opcional) */}
      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>Notas adicionales (opcional):</Text>
        <TextInput
          style={[styles.input, { height: 64, textAlignVertical: 'top' }]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Ej: Dejado con el vigilante"
          multiline
          numberOfLines={2}
        />
      </View>

      <TouchableOpacity 
        style={[styles.nextButton, !packageInfo?.requires_carrier_scan && !recipientName.trim() && styles.buttonDisabled]}
        onPress={() => {
          if (!packageInfo?.requires_carrier_scan && !recipientName.trim()) {
            Alert.alert('Nombre requerido', 'Debes escribir el nombre de quien recibe para continuar.');
            return;
          }

          if (packageInfo?.requires_carrier_scan) {
            validateCarrierGuide();
            return;
          }

          if (!signature) {
            signatureRef.current?.readSignature();
          } else {
            setCurrentStep('photo');
          }
        }}
      >
        <Text style={styles.nextButtonText}>Continuar</Text>
        <MaterialIcons name="arrow-forward" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
    </KeyboardAvoidingView>
  );

  const renderPhotoStep = () => (
    <View style={styles.stepContent}>
      <View style={styles.photoSection}>
        <MaterialIcons name="photo-camera" size={80} color="#F05A28" />
        <Text style={styles.photoTitle}>📸 Foto de Evidencia</Text>
        <Text style={styles.photoSubtitle}>
          Toma una foto del paquete entregado o del recibo
        </Text>

        {photo ? (
          <View style={styles.photoPreviewContainer}>
            <Image source={{ uri: photo }} style={styles.photoPreview} />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <TouchableOpacity 
                style={styles.retakeButton}
                onPress={handleTakePhoto}
              >
                <MaterialIcons name="refresh" size={20} color="#F05A28" />
                <Text style={styles.retakeText}>Volver a tomar</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.retakeButton, { borderColor: '#2196F3' }]}
                onPress={handlePickFromGallery}
              >
                <MaterialIcons name="photo-library" size={20} color="#2196F3" />
                <Text style={[styles.retakeText, { color: '#2196F3' }]}>Galería</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{ gap: 12, alignItems: 'center', width: '100%' }}>
            <TouchableOpacity style={styles.takePhotoButton} onPress={handleTakePhoto}>
              <MaterialIcons name="camera-alt" size={32} color="#fff" />
              <Text style={styles.takePhotoText}>Tomar Foto</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.takePhotoButton, { backgroundColor: '#2196F3' }]}
              onPress={handlePickFromGallery}
            >
              <MaterialIcons name="photo-library" size={32} color="#fff" />
              <Text style={styles.takePhotoText}>Seleccionar de Galería</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.photoActions}>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkipPhoto}
        >
          <Text style={styles.skipButtonText}>Omitir foto</Text>
        </TouchableOpacity>

        {photo && (
          <TouchableOpacity 
            style={styles.nextButton}
            onPress={() => setCurrentStep('confirm')}
          >
            <Text style={styles.nextButtonText}>Continuar</Text>
            <MaterialIcons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderConfirmStep = () => {
    const totalPkgs = 1 + batchPackages.length;
    const isBatch = batchPackages.length > 0;
    return (
    <ScrollView style={styles.stepContent}>
      <Text style={styles.confirmTitle}>Confirmar Entrega</Text>

      {/* Resumen */}
      <View style={styles.summaryBox}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{isBatch ? 'Lote:' : 'Paquete:'}</Text>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.summaryValue}>{packageInfo?.tracking_number}</Text>
            {isBatch && (
              <View style={{ backgroundColor: '#F05A28', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginTop: 2 }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>📦 {totalPkgs} guías en total</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Recibió:</Text>
          <Text style={styles.summaryValue}>
            {packageInfo?.requires_carrier_scan ? 'Mostrador' : (recipientName || 'No especificado')}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Firma:</Text>
          {packageInfo?.requires_carrier_scan ? (
            <Text style={[styles.summaryValue, { color: carrierGuideVerified ? '#4CAF50' : '#FF9800' }]}>
              {carrierGuideVerified ? `✅ ${packageInfo.national_carrier || 'Paquetería externa'}` : '⚠️ Pendiente'}
            </Text>
          ) : (
            <Text style={[styles.summaryValue, { color: signature ? '#4CAF50' : '#FF9800' }]}>
              {signature ? '✅ Capturada' : '⚠️ Pendiente'}
            </Text>
          )}
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Foto:</Text>
          <Text style={[styles.summaryValue, { color: photo ? '#4CAF50' : '#FF9800' }]}>
            {photo ? '✅ Tomada' : '⚠️ Sin foto'}
          </Text>
        </View>
      </View>

      {/* Estado de envío */}
      <View style={{ alignItems: 'center', paddingVertical: 24 }}>
        {loading ? (
          <>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={{ color: '#4CAF50', marginTop: 12, fontWeight: '700', fontSize: 15 }}>
              Registrando {isBatch ? `${totalPkgs} entregas` : 'entrega'}...
            </Text>
            <Text style={{ color: '#888', marginTop: 6, fontSize: 13, textAlign: 'center', paddingHorizontal: 24 }}>
              Por favor espera. Si no hay internet, las entregas se guardan y sincronizan automáticamente al reconectarte.
            </Text>
          </>
        ) : (
          <>
            <MaterialIcons name="check-circle" size={64} color="#4CAF50" />
            <Text style={{ color: '#4CAF50', fontSize: 18, fontWeight: '700', marginTop: 8 }}>
              ✅ {isBatch ? `${totalPkgs} entregas registradas` : 'Entregado'}
            </Text>
          </>
        )}
      </View>

      {loading && (
        <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelButtonText}>Cancelar</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
    );
  };

  // Indicador de pasos
  const getStepNumber = () => {
    switch (currentStep) {
      case 'scan': return 1;
      case 'signature': return 2;
      case 'photo': return 3;
      case 'confirm': return 4;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={styles.title}>Confirmar Entrega 📦</Text>
          <Text style={styles.subtitle}>
            {`Paso ${getStepNumber()} de 4`}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {currentStep === 'scan' && (
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
          )}
        </View>
      </View>

      {/* Progress dots */}
      <View style={styles.progressDots}>
        {['scan', 'signature', 'photo', 'confirm'].map((step, index) => (
          <View
            key={step}
            style={[
              styles.dot,
              getStepNumber() > index + 1 && styles.dotCompleted,
              getStepNumber() === index + 1 && styles.dotActive,
            ]}
          />
        ))}
      </View>

      {/* Step content */}
      {renderStep()}

      {/* Feedback */}
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

      {/* Modal resumen de cajas escaneadas en serie */}
      <Modal visible={showBatchSummaryModal} transparent animationType="slide" onRequestClose={() => setShowBatchSummaryModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <MaterialIcons name="inventory" size={24} color="#F05A28" />
                <Text style={{ fontSize: 17, fontWeight: '800', color: '#111' }}>Guías a Entregar</Text>
                <View style={{ backgroundColor: '#F05A28', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{1 + batchPackages.length}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowBatchSummaryModal(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {/* Caja principal */}
              {packageInfo && (
                <View style={{ backgroundColor: '#FFF5F2', borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#F05A28' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <MaterialIcons name="check-circle" size={14} color="#F05A28" />
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#2E7D32' }}>Caja 1 (principal)</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 2 }}>{packageInfo.tracking_number}</Text>
                  {packageInfo.recipient_name ? <Text style={{ fontSize: 12, color: '#555' }}>{packageInfo.recipient_name}</Text> : null}
                  {packageInfo.delivery_address ? <Text style={{ fontSize: 11, color: '#888' }} numberOfLines={1}>{packageInfo.delivery_address}</Text> : null}
                </View>
              )}
              {/* Cajas adicionales */}
              {batchPackages.map((pkg: any, idx: number) => (
                <View key={idx} style={{ backgroundColor: '#FFF5F2', borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#F05A28' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <MaterialIcons name="check-circle" size={14} color="#F05A28" />
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#F05A28' }}>Guía {idx + 2}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => Alert.alert(
                        'Eliminar caja',
                        `¿Quitar ${pkg.tracking_number} del lote?`,
                        [
                          { text: 'Cancelar', style: 'cancel' },
                          { text: 'Eliminar', style: 'destructive', onPress: () => setBatchPackages(prev => prev.filter((_, i) => i !== idx)) },
                        ]
                      )}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialIcons name="close" size={18} color="#E53935" />
                    </TouchableOpacity>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 2 }}>{pkg.tracking_number}</Text>
                  {pkg.recipient_name ? <Text style={{ fontSize: 12, color: '#555' }}>{pkg.recipient_name}</Text> : null}
                  {pkg.delivery_address ? <Text style={{ fontSize: 11, color: '#888' }} numberOfLines={1}>{pkg.delivery_address}</Text> : null}
                </View>
              ))}
            </ScrollView>
            <View style={{ padding: 16, paddingBottom: 24, flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#F0F0F0', borderRadius: 12, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                onPress={() => setShowBatchSummaryModal(false)}
              >
                <MaterialIcons name="arrow-back" size={20} color="#333" />
                <Text style={{ color: '#333', fontWeight: '700', fontSize: 15 }}>Regresar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#F05A28', borderRadius: 12, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                onPress={() => { setShowBatchSummaryModal(false); addingToBatchRef.current = false; setAddingToBatch(false); setCurrentStep('signature'); }}
              >
                <MaterialIcons name="edit" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Continuar a Firma →</Text>
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
  
  // Progress dots
  progressDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 15,
    backgroundColor: '#fff',
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ddd',
  },
  dotActive: {
    backgroundColor: '#F05A28',
    width: 30,
  },
  dotCompleted: {
    backgroundColor: '#4CAF50',
  },
  
  // Steps
  stepContent: {
    flex: 1,
    padding: 15,
  },
  
  // Scanner
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
    borderColor: '#4CAF50',
  },
  topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 },
  topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 },
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerInputTitle: {
    marginTop: 10,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  scannerInputSubtitle: {
    marginTop: 8,
    marginBottom: 14,
    textAlign: 'center',
    color: '#666',
    fontSize: 14,
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
  manualSubmitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  // Permission
  permissionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
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
    fontWeight: 'bold',
  },
  
  // Package info
  packageInfoBox: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    borderLeftWidth: 4,
    borderLeftColor: '#F05A28',
  },
  packageInfoTracking: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  packageInfoAddress: {
    fontSize: 13,
    color: '#666',
    marginTop: 5,
  },
  packageInfoRecipient: {
    fontSize: 13,
    color: '#888',
    marginTop: 5,
  },
  
  // Signature
  signatureContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  signatureLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  signatureWrapper: {
    height: 180,
    borderRadius: 8,
    overflow: 'hidden',
  },
  signatureActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
  },
  signatureClearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
  },
  signatureClearText: {
    marginLeft: 5,
    color: '#666',
  },
  
  // Inputs
  inputContainer: {
    marginBottom: 15,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  
  // Photo
  photoSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 20,
    color: '#333',
  },
  photoSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 10,
    textAlign: 'center',
  },
  takePhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F05A28',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 10,
    marginTop: 30,
  },
  takePhotoText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  photoPreviewContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  photoPreview: {
    width: 200,
    height: 200,
    borderRadius: 10,
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
    padding: 10,
  },
  retakeText: {
    color: '#F05A28',
    marginLeft: 5,
  },
  photoActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 15,
  },
  skipButton: {
    padding: 15,
  },
  skipButtonText: {
    color: '#666',
    fontSize: 14,
  },
  
  // Buttons
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F05A28',
    padding: 15,
    borderRadius: 8,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 10,
  },
  
  // Confirm step
  confirmTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 10,
  },
  summaryBox: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  summaryLabel: {
    fontSize: 13,
    color: '#666',
  },
  carrierGuideSubtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 10,
  },
  carrierGuideExpectedBox: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#fafafa',
    marginBottom: 12,
  },
  carrierGuideExpectedLabel: {
    fontSize: 12,
    color: '#777',
  },
  carrierGuideExpectedValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F05A28',
    marginTop: 4,
  },
  carrierGuideSecondaryValue: {
    color: '#1976D2',
    fontSize: 16,
  },
  carrierGuideVerifiedBox: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A5D6A7',
  },
  carrierGuideVerifiedText: {
    color: '#2E7D32',
    fontSize: 13,
    fontWeight: '600',
  },
  openCarrierCameraButton: {
    marginTop: 10,
    backgroundColor: '#1976D2',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  openCarrierCameraButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  carrierCameraWrapper: {
    marginTop: 12,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#000',
  },
  carrierCamera: {
    height: 180,
  },
  closeCarrierCameraButton: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  closeCarrierCameraButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 18,
    borderRadius: 10,
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  cancelButton: {
    alignItems: 'center',
    padding: 15,
    marginTop: 10,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 14,
  },
  
  // Feedback
  feedbackBox: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderRadius: 10,
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
  },
  
});

