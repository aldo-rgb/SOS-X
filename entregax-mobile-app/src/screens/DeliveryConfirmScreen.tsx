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
  Platform,
  Keyboard,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import api from '../services/api';
import SignatureScreen from 'react-native-signature-canvas';
import { createAudioPlayer } from 'expo-audio';

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
  const currentUser = route?.params?.user;
  const userBranchUpper = String(currentUser?.branch_code || currentUser?.branch_name || '').toUpperCase();
  const initialScanMode: ScanMode = route?.params?.scanMode === 'scanner' ? 'scanner' : 'camera';
  // Paquetes ya cargados en camioneta — pasados desde DriverHomeScreen para match local rápido
  const cachedLoadedPackages: any[] = route?.params?.loadedPackages || [];
  
  const [currentStep, setCurrentStep] = useState<Step>(preSelectedPackage ? 'signature' : 'scan');
  const [loading, setLoading] = useState(false);
  const [packageInfo, setPackageInfo] = useState<PackageInfo | null>(preSelectedPackage || null);
  const [scannerActive, setScannerActive] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
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
  
  const isPaqueteExpress = (name: string) => /paquete\s*express/i.test(name || '');
  const isLocalCarrier = (name: string) => /entregax|local|pick\s*up|pickup|propio/i.test(name || '');
  const isBodegaOrUnknown = (name: string) => !name || /^bodega$/i.test(name.trim());

  // Para entrega múltiple (cualquier paquetería con guía de carrier)
  const [isBulkDelivery, setIsBulkDelivery] = useState(false);
  const [scannedPackages, setScannedPackages] = useState<Array<{packageId: string, internalGuide: string, carrierGuide: string, selectedCarrierName?: string}>>([]);
  const [currentScanStep, setCurrentScanStep] = useState<'internal' | 'carrier'>('internal');
  const [tempInternalGuide, setTempInternalGuide] = useState('');
  const [tempMasterTracking, setTempMasterTracking] = useState('');
  const [tempCarrierGuide, setTempCarrierGuide] = useState('');
  const [bulkCarrierName, setBulkCarrierName] = useState<string>('');
  const [deliveryTypeAsked, setDeliveryTypeAsked] = useState(false);

  // Selector de paquetería para entrega a carrier externo
  const [deliveryCarriers, setDeliveryCarriers] = useState<Array<{carrier_key: string, name: string, icon?: string}>>([]);
  const [showCarrierPicker, setShowCarrierPicker] = useState(false);
  const [selectedDropoffCarrier, setSelectedDropoffCarrier] = useState<{carrier_key: string, name: string} | null>(null);
  
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

  // Por defecto siempre entrega individual
  // La auto-detección cambiará a múltiple si es necesario
  useEffect(() => {
    if (!deliveryTypeAsked && !preSelectedPackage) {
      setDeliveryTypeAsked(true);
      setIsBulkDelivery(false);
      setCurrentStep('scan');
    }
  }, [deliveryTypeAsked, preSelectedPackage]);

  // Cargar paqueterías configuradas en Nacional México
  useEffect(() => {
    api.get('/api/carrier-options/by-service/mx_national', {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    }).then(res => {
      if (res.data?.data?.length) setDeliveryCarriers(res.data.data);
    }).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (currentStep === 'scan' && !route?.params?.scanMode && !hasAskedModeRef.current && !isBulkDelivery) {
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

  // Detectar si es entrega multi-caja (con guías hijas o asignada a Paquete Express)
  useEffect(() => {
    if (!packageInfo || isBulkDelivery) return; // No hacer nada si ya está en bulk o si no hay paquete
    
    const hasChildren = (packageInfo as any).child_guides?.length > 0 || 
                       (packageInfo as any).has_children === true ||
                       ((packageInfo as any).total_pieces && (packageInfo as any).total_pieces > 1);
    
    const carrierRaw = ((packageInfo as any).national_carrier || '').toString().toLowerCase();
    // EntregaX / local / pickup / bodega (placeholder) NO requieren doble escaneo
    const isOwnDelivery = /entregax|local|pick ?up|propio|bodega/.test(carrierRaw);

    // Paquetes con carrier externo real (Estafeta, FedEx, Paquete Express, etc.) se entregan
    // desde "Envío Paquetería" → no deben procesarse aquí
    const hasExternalCarrier = !isOwnDelivery && carrierRaw !== '' &&
        ((packageInfo as any).national_carrier !== null && (packageInfo as any).national_carrier !== '');
    if (hasExternalCarrier) {
      const carrierName = ((packageInfo as any).national_carrier || 'paquetería').toString();
      setPackageInfo(null);
      setCurrentStep('scan');
      showFeedback({
        type: 'error',
        message: `Este paquete se entrega vía ${carrierName}. Usa "Envío Paquetería" → Mostrador o Recolección.`,
      });
      return;
    }

    const isCarrierService = !isOwnDelivery && (
      (packageInfo as any).requires_carrier_scan === true ||
      ((packageInfo as any).national_carrier !== null && (packageInfo as any).national_carrier !== '')
    );

    // Si detectamos que es multi-caja o tiene carrier nacional EXTERNO, cambiar a bulk
    if (hasChildren || isCarrierService) {
      const scannedGuide = packageInfo.tracking_number || '';
      const carrierName = ((packageInfo as any).national_carrier || 'Paquetería').toString().trim() || 'Paquetería';
      setBulkCarrierName(carrierName);
      setTempInternalGuide(scannedGuide);
      setTempMasterTracking(((packageInfo as any).national_tracking || '').toString().toUpperCase());
      setCurrentScanStep('carrier');
      setIsBulkDelivery(true);
      setCurrentStep('scan');
      showFeedback({
        type: 'success',
        message: hasChildren 
          ? `Guía multi-caja (${scannedGuide}) detectada. Escanea guía de ${carrierName}.`
          : `${carrierName} detectado. Escanea guía del carrier.`,
      });
    }
  }, [packageInfo, isBulkDelivery]);

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

  const processScanCode = useCallback(async (rawCode: string, source: 'camera' | 'scanner' = 'camera') => {
    const data = normalizeScanCode(rawCode);
    if (!data || isScanning) return;
    if (source === 'camera' && (!scannerActive || data === lastScannedCode)) return;

    // Modo múltiple (multi-caja con carrier)
    if (isBulkDelivery) {
      setIsScanning(true);
      if (source === 'camera') setScannerActive(false);
      setLastScannedCode(data);

      try {
        if (currentScanStep === 'internal') {
          // Validar guía interna contra el servidor
          const res = await api.get(`/api/driver/verify-package/${encodeURIComponent(data)}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          });

          if (!res.data.success || !res.data.package) {
            Vibration.vibrate([0, 200, 100, 200]);
            showFeedback({
              type: 'error',
              message: 'Guía interna no encontrada',
            });
            return;
          }

          const pkg = res.data.package;

          // Verificar que no esté duplicada
          if (scannedPackages.some(p => p.internalGuide === data)) {
            Vibration.vibrate([0, 200, 100, 200]);
            showFeedback({
              type: 'error',
              message: `❌ Esta guía (${data}) ya fue escaneada.`,
            });
            return;
          }

          const carrierName = (pkg.national_carrier || bulkCarrierName || '').toString().trim();
          setBulkCarrierName(carrierName);
          setTempInternalGuide(data);
          setTempMasterTracking((pkg.national_tracking || '').toString().toUpperCase());
          setSelectedDropoffCarrier(null);
          setCurrentScanStep('carrier');
          Vibration.vibrate(50);

          if (!isPaqueteExpress(carrierName) && !isLocalCarrier(carrierName)) {
            showFeedback({ type: 'success', message: `✅ Guía interna ${data} validada. Selecciona paquetería de entrega.` });
            setShowCarrierPicker(true);
          } else {
            showFeedback({ type: 'success', message: `✅ Guía interna ${data} validada. Escanea guía de ${carrierName || 'carrier'}.` });
          }
          setManualCode('');
        } else {
          // Validar que no es la misma que la interna
          if (data === tempInternalGuide) {
            Vibration.vibrate([0, 200, 100, 200]);
            showFeedback({
              type: 'error',
              message: `❌ La guía del carrier no puede ser la misma que la guía interna (${data})`,
            });
            return;
          }

          const dataUpper = data.toUpperCase().replace(/[^A-Z0-9]/g, '');

          // Validaciones específicas de Paquete Express (multi-pieza con guía MASTER/HIJA)
          if (isPaqueteExpress(bulkCarrierName)) {
            // Rechazar lectura demasiado corta (parcial del scanner)
            if (dataUpper.length < 14) {
              Vibration.vibrate([0, 200, 100, 200]);
              showFeedback({
                type: 'error',
                message: `❌ Lectura incompleta (${data}). Vuelve a escanear la guía HIJA completa de Paquete Express.`,
              });
              return;
            }

            // Considerar MASTER si NO tiene sufijo de pieza adicional (longitud cercana a 14)
            if (dataUpper.length <= 14) {
              Vibration.vibrate([0, 200, 100, 200]);
              showFeedback({
                type: 'error',
                message: `❌ Escaneaste la guía MASTER (${data}). Debes escanear la guía HIJA de cada caja (master + dígitos de pieza).`,
              });
              return;
            }

            const masterUpper = (tempMasterTracking || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (masterUpper && dataUpper === masterUpper) {
              Vibration.vibrate([0, 200, 100, 200]);
              showFeedback({
                type: 'error',
                message: `❌ Escaneaste la guía MASTER (${data}). Debes escanear la guía HIJA de cada caja.`,
              });
              return;
            }

            if (masterUpper && !dataUpper.startsWith(masterUpper)) {
              Vibration.vibrate([0, 200, 100, 200]);
              showFeedback({
                type: 'error',
                message: `❌ La guía escaneada (${data}) no corresponde al master ${tempMasterTracking}. Verifica que estés escaneando la etiqueta correcta.`,
              });
              return;
            }

            if (!masterUpper) {
              const isPqtxFormat = /^[A-Z]{2,}\d+[A-Z]+/.test(dataUpper);
              if (!isPqtxFormat) {
                Vibration.vibrate([0, 200, 100, 200]);
                showFeedback({
                  type: 'error',
                  message: `❌ La guía (${data}) no parece ser de Paquete Express. Verifica que estés escaneando la etiqueta correcta.`,
                });
                return;
              }
            }
          }

          // Verificar que la guía del carrier sea diferente de otras ya escaneadas
          // Comparación tolerante: quita no-alfanuméricos y ceros a la izquierda del sufijo
          const normalizeForDup = (s: string) => {
            const clean = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            // quita ceros redundantes después del último bloque alfa para igualar truncados/padding
            return clean.replace(/^([A-Z0-9]*?[A-Z])0*(\d+)$/, '$1$2');
          };
          const dataKey = normalizeForDup(data);
          const dupFound = scannedPackages.find(p => {
            const k = normalizeForDup(p.carrierGuide);
            return k === dataKey || k.startsWith(dataKey) || dataKey.startsWith(k);
          });
          if (dupFound) {
            Vibration.vibrate([0, 200, 100, 200]);
            showFeedback({
              type: 'error',
              message: `❌ Esta guía de carrier (${data}) ya fue escaneada (Caja ${dupFound.packageId}).`,
            });
            return;
          }

          // Validar contra el servidor: que no esté asignada a OTRO paquete
          try {
            const checkRes = await api.get(`/api/driver/check-carrier-guide/${encodeURIComponent(data)}`, {
              params: { excludeInternal: tempInternalGuide },
              headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            });
            if (checkRes.data && checkRes.data.available === false) {
              const usedBy = checkRes.data.usedBy || {};
              Vibration.vibrate([0, 200, 100, 200]);
              showFeedback({
                type: 'error',
                message: `❌ Esta guía (${data}) ya está asignada al paquete ${usedBy.tracking || 'otro'} (estado: ${usedBy.status || 'n/a'}).`,
              });
              return;
            }
          } catch (e) {
            // Si el endpoint falla, continuamos pero advertimos en consola
            console.warn('check-carrier-guide falló, continuando:', e);
          }

          const newPackage = {
            packageId: `${scannedPackages.length + 1}`,
            internalGuide: tempInternalGuide,
            carrierGuide: data,
            selectedCarrierName: selectedDropoffCarrier?.name,
          };
          setScannedPackages([...scannedPackages, newPackage]);
          setTempInternalGuide('');
          setTempMasterTracking('');
          setSelectedDropoffCarrier(null);
          setCurrentScanStep('internal');
          Vibration.vibrate(100);
          showFeedback({
            type: 'success',
            message: `✅ Caja ${scannedPackages.length + 1} registrada: ${tempInternalGuide} → ${data}. Siguiente caja...`,
          });
          setManualCode('');
        }
      } catch (error: any) {
        Vibration.vibrate([0, 200, 100, 200]);
        showFeedback({
          type: 'error',
          message: error.response?.data?.error || 'Error al escanear. Intenta nuevamente.',
        });
      } finally {
        setTimeout(() => {
          setIsScanning(false);
          if (source === 'camera') setScannerActive(true);
          setLastScannedCode('');
        }, source === 'camera' ? 1500 : 500);
      }
      return;
    }

    // Modo individual (flujo normal)
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

        // Si ya tenemos un paquete cargado y NO requiere carrier scan,
        // estamos agregando una caja adicional al lote (misma firma/foto/nombre).
        if (packageInfo && !packageInfo.requires_carrier_scan && !newPkg.requires_carrier_scan) {
          // Evitar duplicados (mismo tracking que el principal o que ya está en el batch)
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
      setTimeout(() => {
        setIsScanning(false);
        if (source === 'camera') setScannerActive(true);
        setLastScannedCode('');
      }, source === 'camera' ? 1500 : 500);
    }
  }, [scannerActive, isScanning, lastScannedCode, token, isBulkDelivery, currentScanStep, tempInternalGuide, tempMasterTracking, scannedPackages, packageInfo, batchPackages]);

  const handleBarCodeScanned = useCallback(async (result: BarcodeScanningResult) => {
    await processScanCode(result.data, 'camera');
  }, [processScanCode]);

  const handleManualSubmit = async () => {
    const code = normalizeScanCode(manualCode);
    if (!code) return;
    setManualCode('');
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
    // Modo múltiple
    if (isBulkDelivery) {
      if (!photo) {
        Alert.alert('Foto requerida', 'Debes tomar una foto antes de confirmar la entrega múltiple.');
        return;
      }

      setLoading(true);
      try {
        // Confirmar cada caja - pasar todas las guías al backend para procesamiento bulk
        const res = await api.post('/api/driver/confirm-delivery-bulk', {
          packages: scannedPackages.map(pkg => ({
            internalGuide: pkg.internalGuide,
            carrierGuide: pkg.carrierGuide,
            selectedCarrierName: pkg.selectedCarrierName,
          })),
          photoBase64: photo,
          signatureBase64: signature,
          recipientName: recipientName.trim(),
          notes: notes,
        }, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        if (res.data.success) {
          Vibration.vibrate(100);
          const confirmedCount = res.data.confirmed?.length ?? scannedPackages.length;
          const errs: string[] = res.data.errors || [];
          if (errs.length > 0) {
            Alert.alert(
              `Entrega parcial: ${confirmedCount} de ${scannedPackages.length}`,
              `Algunos paquetes no se actualizaron:\n\n${errs.join('\n')}`,
              [{ text: 'OK', onPress: () => {
                setIsBulkDelivery(false);
                setScannedPackages([]);
                setCurrentScanStep('internal');
                setPhoto('');
                setNotes('');
                navigation.goBack();
              }}]
            );
          } else {
            // Resetear estado y volver al menú anterior inmediatamente
            setIsBulkDelivery(false);
            setScannedPackages([]);
            setCurrentScanStep('internal');
            setPhoto('');
            setNotes('');
            navigation.goBack();
          }
        } else {
          throw new Error(res.data.error || 'Error desconocido');
        }
      } catch (error: any) {
        Alert.alert('Error', error.response?.data?.error || error.message || 'No se pudo confirmar la entrega');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Modo individual (flujo normal)
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
          deliveredErr.push(`${pkg.tracking_number}: ${e.response?.data?.error || e.message || 'error'}`);
        }
      }

      if (deliveredOk.length > 0) {
        Vibration.vibrate(100);
        showFeedback({ type: 'success', message: `✅ ${deliveredOk.length} paquete(s) entregado(s)` });
        setTimeout(() => navigation.goBack(), 1500);
      } else {
        Alert.alert('Error', `No se pudo confirmar ninguna entrega:\n${deliveredErr.join('\n')}`);
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error || 'No se pudo confirmar la entrega');
    } finally {
      setLoading(false);
    }
  };

  // Renderizar paso actual
  const renderStep = () => {
    // Si es modo múltiple, usar flujo especial
    if (isBulkDelivery && currentStep === 'scan') {
      return renderBulkScanStep();
    }
    if (isBulkDelivery && currentStep === 'confirm') {
      return renderBulkConfirmStep();
    }

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
          <>
            <View style={styles.scannerWrapper}>
              <CameraView
                style={styles.scanner}
                barcodeScannerSettings={{
                  barcodeTypes: ['code128', 'code39', 'qr', 'ean13', 'ean8'],
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
                  <Text style={styles.scanningText}>Verificando...</Text>
                </View>
              )}
            </View>
            <Text style={styles.helperText}>
              📷 Escanea el código del paquete a entregar
            </Text>
          </>
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
            {/* Botón "Listo" en modo escaneo en serie */}
            {packageInfo && !isBulkDelivery && batchPackages.length > 0 && (
              <TouchableOpacity
                style={{ marginTop: 12, backgroundColor: '#4CAF50', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                onPress={() => setCurrentStep('signature')}
              >
                <MaterialIcons name="check" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                  Listo · {1 + batchPackages.length} cajas · Continuar →
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderBulkScanStep = () => {
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

    const instruction = currentScanStep === 'internal' 
      ? `Escanea Guía Interna (Caja ${scannedPackages.length + 1})`
      : `Escanea Guía ${bulkCarrierName || 'del Carrier'} (Caja ${scannedPackages.length + 1})`;

    return (
      <View style={styles.stepContent}>
        {/* Resumen de cajas escaneadas */}
        {scannedPackages.length > 0 && (
          <View style={styles.bulkSummaryBox}>
            <Text style={styles.bulkSummaryTitle}>Cajas Registradas: {scannedPackages.length}</Text>
            <ScrollView style={{ maxHeight: 150 }} showsVerticalScrollIndicator={true}>
              {scannedPackages.map((pkg, idx) => (
                <View key={idx} style={styles.bulkPackageItem}>
                  <Text style={styles.bulkPackageIndex}>Caja {idx + 1}:</Text>
                  <Text style={styles.bulkPackageCode}>{pkg.internalGuide}</Text>
                  {pkg.carrierGuide && (
                    <Text style={styles.bulkPackageCode}>{pkg.carrierGuide}</Text>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {scanMode === 'camera' ? (
          <>
            <View style={styles.scannerWrapper}>
              <CameraView
                style={styles.scanner}
                barcodeScannerSettings={{
                  barcodeTypes: ['code128', 'code39', 'qr', 'ean13', 'ean8'],
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
                  <Text style={styles.scanningText}>Verificando...</Text>
                </View>
              )}
            </View>
            <Text style={styles.helperText}>📷 {instruction}</Text>
          </>
        ) : (
          <View style={styles.scannerInputCard}>
            <MaterialIcons name="qr-code-scanner" size={52} color="#F05A28" />
            <Text style={styles.scannerInputTitle}>{instruction}</Text>
            <Text style={styles.scannerInputSubtitle}>
              {currentScanStep === 'carrier' ? 'Escanea con el lector externo o escribe manualmente.' : 'Usa lector externo o escribe manualmente.'}
            </Text>
            <TextInput
              ref={manualInputRef}
              style={styles.scannerInput}
              placeholder={currentScanStep === 'internal' ? 'Guía Interna' : `Guía ${bulkCarrierName || 'del Carrier'}`}
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
            {currentScanStep === 'carrier' && !isPaqueteExpress(bulkCarrierName) && (
              <View style={styles.carrierPickerSection}>
                {/* CASO 1: Carrier asignado por el sistema (no BODEGA, no vacío) */}
                {!isBodegaOrUnknown(bulkCarrierName) ? (
                  <>
                    <View style={styles.selectedCarrierRow}>
                      <MaterialIcons name="local-shipping" size={20} color="#555" />
                      <Text style={styles.selectedCarrierName}>{bulkCarrierName}</Text>
                      <View style={styles.systemBadge}>
                        <Text style={styles.systemBadgeText}>Sistema</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.registerBoxButton}
                      onPress={() => {
                        const guide = manualCode.trim() || bulkCarrierName;
                        const newPackage = {
                          packageId: `${scannedPackages.length + 1}`,
                          internalGuide: tempInternalGuide,
                          carrierGuide: guide,
                          selectedCarrierName: bulkCarrierName,
                        };
                        setScannedPackages([...scannedPackages, newPackage]);
                        setTempInternalGuide('');
                        setTempMasterTracking('');
                        setCurrentScanStep('internal');
                        setManualCode('');
                        Vibration.vibrate(100);
                        showFeedback({ type: 'success', message: `✅ Caja ${scannedPackages.length + 1} registrada → ${bulkCarrierName}. Siguiente caja...` });
                      }}
                    >
                      <MaterialIcons name="check-circle" size={20} color="#fff" />
                      <Text style={styles.registerBoxText}>Registrar en {bulkCarrierName}</Text>
                    </TouchableOpacity>
                  </>
                ) : selectedDropoffCarrier ? (
                  /* CASO 2: Usuario seleccionó paquetería del picker */
                  <>
                    <View style={styles.selectedCarrierRow}>
                      <MaterialIcons name="local-shipping" size={20} color="#F05A28" />
                      <Text style={styles.selectedCarrierName}>{selectedDropoffCarrier.name}</Text>
                      <TouchableOpacity onPress={() => setShowCarrierPicker(true)} style={styles.changeCarrierBtn}>
                        <Text style={styles.changeCarrierText}>Cambiar</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      style={styles.registerBoxButton}
                      onPress={() => {
                        const guide = manualCode.trim() || selectedDropoffCarrier.name;
                        const newPackage = {
                          packageId: `${scannedPackages.length + 1}`,
                          internalGuide: tempInternalGuide,
                          carrierGuide: guide,
                          selectedCarrierName: selectedDropoffCarrier.name,
                        };
                        setScannedPackages([...scannedPackages, newPackage]);
                        setTempInternalGuide('');
                        setTempMasterTracking('');
                        setSelectedDropoffCarrier(null);
                        setCurrentScanStep('internal');
                        setManualCode('');
                        Vibration.vibrate(100);
                        showFeedback({ type: 'success', message: `✅ Caja ${scannedPackages.length + 1} registrada → ${selectedDropoffCarrier.name}. Siguiente caja...` });
                      }}
                    >
                      <MaterialIcons name="check-circle" size={20} color="#fff" />
                      <Text style={styles.registerBoxText}>Registrar en {selectedDropoffCarrier.name}</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  /* CASO 3: Sin carrier conocido (BODEGA) → mostrar selector */
                  <TouchableOpacity
                    style={styles.selectCarrierButton}
                    onPress={() => setShowCarrierPicker(true)}
                  >
                    <MaterialIcons name="local-shipping" size={20} color="#F05A28" />
                    <Text style={styles.selectCarrierText}>Seleccionar paquetería de entrega</Text>
                    <MaterialIcons name="chevron-right" size={20} color="#F05A28" />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}

        {/* Botón para terminar de escanear cajas */}
        {scannedPackages.length > 0 && (
          <TouchableOpacity
            style={styles.finishBulkButton}
            onPress={() => {
              // Pasar a capturar foto
              setCurrentStep('photo');
            }}
          >
            <MaterialIcons name="done-all" size={20} color="#fff" />
            <Text style={styles.finishBulkButtonText}>
              Terminar Escaneo ({scannedPackages.length} cajas)
            </Text>
          </TouchableOpacity>
        )}
      {/* Modal selector de paquetería */}
      <Modal
        visible={showCarrierPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCarrierPicker(false)}
      >
        <View style={styles.carrierModalOverlay}>
          <View style={styles.carrierModalSheet}>
            <View style={styles.carrierModalHeader}>
              <Text style={styles.carrierModalTitle}>Selecciona paquetería</Text>
              <TouchableOpacity onPress={() => setShowCarrierPicker(false)}>
                <MaterialIcons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <CarrierList
              carriers={deliveryCarriers}
              userBranchUpper={userBranchUpper}
              selectedKey={selectedDropoffCarrier?.carrier_key}
              onSelect={(carrier) => { setSelectedDropoffCarrier(carrier); setShowCarrierPicker(false); }}
            />
          </View>
        </View>
      </Modal>
      </View>
    );
  };

  const renderSignatureStep = () => (
    <View style={styles.stepContent}>
      {/* Info del paquete */}
      <View style={styles.packageInfoBox}>
        <Text style={styles.packageInfoTracking}>{packageInfo?.tracking_number}</Text>
        <Text style={styles.packageInfoAddress} numberOfLines={2}>
          📍 {packageInfo?.delivery_address}
        </Text>
        <Text style={styles.packageInfoRecipient}>
          👤 {packageInfo?.recipient_name}
        </Text>
      </View>

      {/* Lote de cajas adicionales (entrega local) */}
      {!packageInfo?.requires_carrier_scan && batchPackages.length > 0 && (
        <View style={[styles.packageInfoBox, { backgroundColor: '#FFF6F0', borderColor: '#F05A28', borderWidth: 1 }]}>
          <Text style={[styles.packageInfoTracking, { fontSize: 13, marginBottom: 6 }]}>
            📦 Cajas adicionales ({batchPackages.length})
          </Text>
          {batchPackages.map((p, idx) => (
            <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 2 }}>
              <Text style={{ fontSize: 12, color: '#444', flex: 1 }} numberOfLines={1}>
                {idx + 2}. {p.tracking_number}
              </Text>
              <TouchableOpacity
                onPress={() => setBatchPackages(prev => prev.filter((_, i) => i !== idx))}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="close" size={18} color="#C1272D" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Botón para agregar otra caja al mismo lote (solo entrega local) */}
      {!packageInfo?.requires_carrier_scan && (
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
  );

  const renderPhotoStep = () => (
    <View style={styles.stepContent}>
      <View style={styles.photoSection}>
        <MaterialIcons name="photo-camera" size={80} color="#F05A28" />
        <Text style={styles.photoTitle}>📸 Foto de Evidencia</Text>
        <Text style={styles.photoSubtitle}>
          {isBulkDelivery ? 'Toma una foto de las cajas entregadas' : 'Toma una foto del paquete entregado o del recibo'}
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
        {!isBulkDelivery && (
          <TouchableOpacity 
            style={styles.skipButton}
            onPress={handleSkipPhoto}
          >
            <Text style={styles.skipButtonText}>Omitir foto</Text>
          </TouchableOpacity>
        )}

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

  const renderConfirmStep = () => (
    <ScrollView style={styles.stepContent}>
      <Text style={styles.confirmTitle}>Confirmar Entrega</Text>
      
      {/* Resumen */}
      <View style={styles.summaryBox}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Paquete:</Text>
          <Text style={styles.summaryValue}>{packageInfo?.tracking_number}</Text>
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
              {carrierGuideVerified
                ? `✅ ${packageInfo.national_carrier || 'Paquetería externa'}`
                : '⚠️ Pendiente'}
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

      {/* Confirmando... */}
      <View style={{ alignItems: 'center', paddingVertical: 24 }}>
        {loading ? (
          <>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={{ color: '#4CAF50', marginTop: 8, fontWeight: '600' }}>Confirmando entrega...</Text>
          </>
        ) : (
          <>
            <MaterialIcons name="check-circle" size={64} color="#4CAF50" />
            <Text style={{ color: '#4CAF50', fontSize: 18, fontWeight: '700', marginTop: 8 }}>✅ Entregado</Text>
          </>
        )}
      </View>

      {/* Cancelar si aún está cargando */}
      {loading && (
        <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelButtonText}>Cancelar</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );

  const renderBulkConfirmStep = () => (
    <ScrollView style={styles.stepContent}>
      <Text style={styles.confirmTitle}>Confirmar Entrega de {scannedPackages.length} Cajas</Text>
      
      {/* Resumen de cajas */}
      <View style={styles.summaryBox}>
        <Text style={[styles.summaryLabel, { fontSize: 16, fontWeight: 'bold', marginBottom: 10 }]}>
          Cajas Registradas:
        </Text>
        {scannedPackages.map((pkg, idx) => (
          <View key={idx} style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { fontWeight: 'bold' }]}>Caja {idx + 1}:</Text>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={[styles.summaryValue, { fontSize: 12 }]}>{pkg.internalGuide}</Text>
              <Text style={[styles.summaryValue, { fontSize: 12 }]}>{pkg.carrierGuide}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Foto */}
      <View style={styles.photoSection}>
        <MaterialIcons name="photo-camera" size={80} color="#F05A28" />
        <Text style={styles.photoTitle}>📸 Foto de Evidencia</Text>
        <Text style={styles.photoSubtitle}>
          Toma una foto de las cajas entregadas
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

      {/* Notas adicionales */}
      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>Notas adicionales (opcional):</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Ej: Entregado en mostrador"
          multiline
          numberOfLines={3}
        />
      </View>

      {/* Botón confirmar */}
      <TouchableOpacity 
        style={[styles.confirmButton, (loading || !photo) && styles.buttonDisabled]}
        onPress={() => handleConfirmDelivery()}
        disabled={loading || !photo}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <MaterialIcons name="check-circle" size={24} color="#fff" />
            <Text style={styles.confirmButtonText}>CONFIRMAR {scannedPackages.length} CAJAS</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Botón cancelar */}
      <TouchableOpacity 
        style={styles.cancelButton}
        onPress={() => {
          setIsBulkDelivery(false);
          setScannedPackages([]);
          setCurrentScanStep('internal');
          setCurrentStep('scan');
        }}
      >
        <Text style={styles.cancelButtonText}>Cancelar</Text>
      </TouchableOpacity>
    </ScrollView>
  );

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
            {isBulkDelivery ? `Entrega Múltiple - Caja ${scannedPackages.length + 1}` : `Paso ${getStepNumber()} de 4`}
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
          <TouchableOpacity
            style={[styles.modeButton, { backgroundColor: isBulkDelivery ? '#FF6B6B' : '#E8E8E8' }]}
            onPress={() => {
              if (isBulkDelivery) {
                // Si ya está en modo múltiple, cancelar
                setIsBulkDelivery(false);
                setScannedPackages([]);
                setCurrentScanStep('internal');
                setTempInternalGuide('');
                setTempMasterTracking('');
                setTempCarrierGuide('');
              } else {
                // Cambiar a modo múltiple
                setIsBulkDelivery(true);
              }
            }}
          >
            <MaterialIcons 
              name={isBulkDelivery ? 'done-all' : 'inbox'} 
              size={22} 
              color={isBulkDelivery ? '#FFF' : '#666'} 
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress dots */}
      {isBulkDelivery ? (
        <View style={styles.bulkProgressContainer}>
          <View style={styles.bulkProgressBar}>
            <View 
              style={[
                styles.bulkProgressFill,
                { 
                  width: currentStep === 'photo' 
                    ? '100%'
                    : (scannedPackages.length / 5) * 100 + '%'
                }
              ]}
            />
          </View>
          <Text style={styles.bulkProgressText}>
            {currentStep === 'photo' 
              ? 'Capturar Foto (Paso Final)' 
              : `${scannedPackages.length} cajas escaneadas`}
          </Text>
        </View>
      ) : (
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
      )}

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
  carrierPickerSection: {
    marginTop: 12,
    gap: 8,
    alignSelf: 'stretch',
  },
  selectCarrierButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#F05A28',
    backgroundColor: '#fff8f5',
    alignSelf: 'stretch',
  },
  selectCarrierText: {
    flex: 1,
    color: '#F05A28',
    fontSize: 15,
    fontWeight: '600',
  },
  selectedCarrierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  selectedCarrierName: {
    flex: 1,
    color: '#333',
    fontSize: 15,
    fontWeight: '700',
  },
  systemBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#E0E0E0',
  },
  systemBadgeText: {
    color: '#555',
    fontSize: 11,
    fontWeight: '600',
  },
  changeCarrierBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F05A28',
  },
  changeCarrierText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  registerBoxButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#2E7D32',
    alignSelf: 'stretch',
  },
  registerBoxText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  // Carrier Picker Modal
  carrierModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  carrierModalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 30,
  },
  carrierModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  carrierModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  carrierModalEmpty: {
    alignItems: 'center',
    padding: 40,
    gap: 12,
  },
  carrierModalEmptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888',
    textAlign: 'center',
  },
  carrierModalEmptySubtext: {
    fontSize: 13,
    color: '#aaa',
    textAlign: 'center',
  },
  carrierOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  carrierOptionSelected: {
    backgroundColor: '#FFF8F5',
  },
  carrierOptionIcon: {
    width: 32,
    height: 32,
    resizeMode: 'contain',
    borderRadius: 4,
  },
  carrierOptionName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
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
    flex: 1,
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
    flex: 1,
    minHeight: 200,
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
  
  // Bulk delivery
  bulkSummaryBox: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 15,
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B6B',
  },
  bulkSummaryTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FF6B6B',
    marginBottom: 10,
  },
  bulkPackageItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  bulkPackageIndex: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  bulkPackageCode: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
    marginTop: 2,
  },
  finishBulkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 10,
    marginTop: 15,
    gap: 8,
  },
  finishBulkButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  
  // Bulk progress
  bulkProgressContainer: {
    paddingHorizontal: 15,
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  bulkProgressBar: {
    height: 8,
    backgroundColor: '#eee',
    borderRadius: 4,
    overflow: 'hidden',
  },
  bulkProgressFill: {
    height: '100%',
    backgroundColor: '#F05A28',
    borderRadius: 4,
  },
  bulkProgressText: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    fontWeight: '500',
  },
});

// ─────────────────────────────────────────────
// CarrierList — subcomponente para el picker de paquetería
// Filtra carriers según la sucursal del usuario
// ─────────────────────────────────────────────
function CarrierList({
  carriers,
  userBranchUpper,
  selectedKey,
  onSelect,
}: {
  carriers: Array<{ carrier_key: string; name: string; icon?: string }>;
  userBranchUpper: string;
  selectedKey?: string;
  onSelect: (carrier: { carrier_key: string; name: string }) => void;
}) {
  const isMTY = userBranchUpper.includes('MTY') || userBranchUpper.includes('MONTERREY');
  const isCDMX = userBranchUpper.includes('CDMX');

  const filtered = carriers.filter((c) => {
    const n = c.name.toUpperCase();
    if (isMTY && (n.includes('CDMX') || n.includes('CIUDAD DE MX'))) return false;
    if (isCDMX && (n.includes(' MTY') || n.includes('MONTERREY'))) return false;
    return true;
  });

  if (filtered.length === 0) {
    return (
      <View style={styles.carrierModalEmpty}>
        <MaterialIcons name="local-shipping" size={40} color="#ccc" />
        <Text style={styles.carrierModalEmptyText}>No hay paqueterías configuradas.</Text>
        <Text style={styles.carrierModalEmptySubtext}>
          Configura paqueterías en Operaciones → Nacional México.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.carrier_key}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={[
            styles.carrierOption,
            selectedKey === item.carrier_key && styles.carrierOptionSelected,
          ]}
          onPress={() => onSelect({ carrier_key: item.carrier_key, name: item.name })}
        >
          {item.icon ? (
            <Image source={{ uri: item.icon }} style={styles.carrierOptionIcon} />
          ) : (
            <MaterialIcons name="local-shipping" size={24} color="#F05A28" />
          )}
          <Text style={styles.carrierOptionName}>{item.name}</Text>
          {selectedKey === item.carrier_key && (
            <MaterialIcons name="check-circle" size={20} color="#F05A28" />
          )}
        </TouchableOpacity>
      )}
    />
  );
}
