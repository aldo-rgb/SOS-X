/**
 * DeliveryConfirmScreen - Confirmación de Entrega
 * 
 * Funcionalidad:
 * - Escanear paquete a entregar
 * - Capturar firma del cliente
 * - Tomar foto de evidencia
 * - Confirmar entrega con todos los datos
 */

import React, { useState, useRef, useCallback } from 'react';
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
}

type Step = 'scan' | 'signature' | 'photo' | 'confirm';

export default function DeliveryConfirmScreen({ navigation, route }: any) {
  const preSelectedPackage = route?.params?.package;
  
  const [currentStep, setCurrentStep] = useState<Step>(preSelectedPackage ? 'signature' : 'scan');
  const [loading, setLoading] = useState(false);
  const [packageInfo, setPackageInfo] = useState<PackageInfo | null>(preSelectedPackage || null);
  const [scannerActive, setScannerActive] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState('');
  
  // Datos de entrega
  const [signature, setSignature] = useState<string>('');
  const [photo, setPhoto] = useState<string>('');
  const [recipientName, setRecipientName] = useState('');
  const [notes, setNotes] = useState('');
  
  const [permission, requestPermission] = useCameraPermissions();
  const signatureRef = useRef<any>(null);
  const feedbackOpacity = useRef(new Animated.Value(0)).current;
  const [feedback, setFeedback] = useState<{type: 'success' | 'error', message: string} | null>(null);

  const showFeedback = (fb: {type: 'success' | 'error', message: string}) => {
    setFeedback(fb);
    Animated.sequence([
      Animated.timing(feedbackOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(feedbackOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setFeedback(null));
  };

  const handleBarCodeScanned = useCallback(async (result: BarcodeScanningResult) => {
    const { data } = result;
    
    if (!scannerActive || isScanning || data === lastScannedCode) return;

    setIsScanning(true);
    setScannerActive(false);
    setLastScannedCode(data);

    try {
      // Verificar que el paquete existe y está asignado al chofer
      const res = await api.get(`/api/driver/verify-package/${data}`);
      
      if (res.data.success && res.data.package) {
        Vibration.vibrate(100);
        setPackageInfo(res.data.package);
        setRecipientName(res.data.package.recipient_name || '');
        setCurrentStep('signature');
      }
    } catch (error: any) {
      Vibration.vibrate([0, 200, 100, 200]);
      showFeedback({
        type: 'error',
        message: error.response?.data?.error || 'Paquete no encontrado o no asignado',
      });
      setTimeout(() => {
        setIsScanning(false);
        setScannerActive(true);
        setLastScannedCode('');
      }, 1500);
    }
  }, [scannerActive, isScanning, lastScannedCode]);

  const handleSignatureEnd = () => {
    signatureRef.current?.readSignature();
  };

  const handleSignatureOK = (signatureData: string) => {
    setSignature(signatureData);
    setCurrentStep('photo');
  };

  const handleSignatureClear = () => {
    signatureRef.current?.clearSignature();
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

    setLoading(true);
    try {
      const res = await api.post('/api/driver/confirm-delivery', {
        barcode: packageInfo.tracking_number,
        signatureBase64: signature,
        photoBase64: photo,
        recipientName: recipientName,
        notes: notes,
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
    if (!permission?.granted) {
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
      </View>

      {/* Input nombre del receptor */}
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

      <TouchableOpacity 
        style={styles.nextButton}
        onPress={() => {
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
            <TouchableOpacity 
              style={styles.retakeButton}
              onPress={handleTakePhoto}
            >
              <MaterialIcons name="refresh" size={20} color="#F05A28" />
              <Text style={styles.retakeText}>Volver a tomar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.takePhotoButton} onPress={handleTakePhoto}>
            <MaterialIcons name="camera-alt" size={32} color="#fff" />
            <Text style={styles.takePhotoText}>Tomar Foto</Text>
          </TouchableOpacity>
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
          <Text style={styles.summaryValue}>{recipientName || 'No especificado'}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Firma:</Text>
          <Text style={[styles.summaryValue, { color: signature ? '#4CAF50' : '#FF9800' }]}>
            {signature ? '✅ Capturada' : '⚠️ Pendiente'}
          </Text>
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
