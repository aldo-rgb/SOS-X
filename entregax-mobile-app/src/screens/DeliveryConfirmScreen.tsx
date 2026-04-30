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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import api from '../services/api';
import SignatureScreen from 'react-native-signature-canvas';

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

  const compactTrackingDigits = code.match(/^([A-Z]{2,})(\d{4,})$/);
  if (compactTrackingDigits?.[0]) {
    return `${compactTrackingDigits[1]}-${compactTrackingDigits[2]}`;
  }

  return code;
};

// Función para extraer guía master y números extra de una guía múltiple
const extractMasterGuide = (scannedCode: string): { masterGuide: string; extraNumbers: string } => {
  // Detecta patrones como: MTY01WE0A18289004003
  // Donde MTY01WE0A18289 es la guía master y 004003 son números extra
  const match = scannedCode.match(/^([A-Z0-9]+?)(\d{6})$/);
  if (match) {
    return { masterGuide: match[1], extraNumbers: match[2] };
  }
  return { masterGuide: scannedCode, extraNumbers: '' };
};

export default function DeliveryConfirmScreen({ navigation, route }: any) {
  const preSelectedPackage = route?.params?.package;
  const token = route?.params?.token;
  const initialScanMode: ScanMode = route?.params?.scanMode === 'scanner' ? 'scanner' : 'camera';
  
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
  
  const [permission, requestPermission] = useCameraPermissions();
  const signatureRef = useRef<any>(null);
  const feedbackOpacity = useRef(new Animated.Value(0)).current;
  const [feedback, setFeedback] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const hasAskedModeRef = useRef(false);
  const manualInputRef = useRef<TextInput | null>(null);
  const carrierGuideInputRef = useRef<TextInput | null>(null);

  const showFeedback = (fb: {type: 'success' | 'error', message: string}) => {
    setFeedback(fb);
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

  const processScanCode = useCallback(async (rawCode: string, source: 'camera' | 'scanner' = 'camera') => {
    const data = normalizeScanCode(rawCode);
    if (!data || isScanning) return;
    if (source === 'camera' && (!scannerActive || data === lastScannedCode)) return;

    setIsScanning(true);
    if (source === 'camera') setScannerActive(false);
    setLastScannedCode(data);

    try {
      // Verificar que el paquete existe y está asignado al chofer
      const res = await api.get(`/api/driver/verify-package/${encodeURIComponent(data)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      
      if (res.data.success && res.data.package) {
        Vibration.vibrate(100);
        setPackageInfo(res.data.package);
        setRecipientName(res.data.package.recipient_name || '');
        setCarrierGuideCode('');
        setCarrierGuideVerified(false);
        setCurrentStep('signature');
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
  }, [scannerActive, isScanning, lastScannedCode, token]);

  const handleBarCodeScanned = useCallback(async (result: BarcodeScanningResult) => {
    await processScanCode(result.data, 'camera');
  }, [processScanCode]);

  const handleManualSubmit = async () => {
    const code = normalizeScanCode(manualCode);
    if (!code) return;
    setManualCode('');
    await processScanCode(code, 'scanner');
  };

  const handleSignatureEnd = () => {
    signatureRef.current?.readSignature();
  };

  const handleSignatureOK = (signatureData: string) => {
    setSignature(signatureData);

    if (!packageInfo?.requires_carrier_scan && !recipientName.trim()) {
      Alert.alert('Nombre requerido', 'Debes escribir el nombre de quien recibe para continuar.');
      return;
    }

    setCurrentStep('photo');
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
        setPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
        setCurrentStep('confirm');
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
        setPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
        setCurrentStep('confirm');
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudo seleccionar la foto');
    }
  };

  const handleSkipPhoto = () => {
    Alert.alert(
      'Omitir Foto',
      '¿Estás seguro de confirmar la entrega sin foto de evidencia?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Continuar', onPress: () => setCurrentStep('confirm') },
      ]
    );
  };

  const handleConfirmDelivery = async () => {
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

    setLoading(true);
    try {
      const res = await api.post('/api/driver/confirm-delivery', {
        barcode: packageInfo.tracking_number,
        signatureBase64: signature,
        photoBase64: photo,
        recipientName: requiresCarrierScan ? '' : trimmedRecipientName,
        notes: notes,
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (res.data.success) {
        Vibration.vibrate(100);
        Alert.alert(
          '✅ Entrega Confirmada',
          `Paquete ${packageInfo.tracking_number} entregado exitosamente.`,
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error || 'No se pudo confirmar la entrega');
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
          </View>
        )}
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

      {/* Notas adicionales */}
      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>Notas adicionales (opcional):</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Ej: Dejado con el vigilante"
          multiline
          numberOfLines={3}
        />
      </View>

      {/* Botón confirmar */}
      <TouchableOpacity 
        style={[styles.confirmButton, loading && styles.buttonDisabled]}
        onPress={handleConfirmDelivery}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <MaterialIcons name="check-circle" size={24} color="#fff" />
            <Text style={styles.confirmButtonText}>CONFIRMAR ENTREGA</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Botón cancelar */}
      <TouchableOpacity 
        style={styles.cancelButton}
        onPress={() => navigation.goBack()}
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
          <Text style={styles.subtitle}>Paso {getStepNumber()} de 4</Text>
        </View>
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
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 20,
  },
  summaryBox: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  summaryLabel: {
    fontSize: 14,
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
