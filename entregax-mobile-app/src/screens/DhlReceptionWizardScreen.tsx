// ============================================
// WIZARD DE RECEPCIÓN DHL MOBILE 📦
// Para usuarios con rol: bodega
// Flujo: Escanear → Clasificar → Peso (BLE) → Medidas (IA)
// ============================================

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Vibration,
  Platform,
  Dimensions,
} from 'react-native';
import { Camera, CameraView, BarcodeScanningResult } from 'expo-camera';
// BLE library - needs to be installed: npm install react-native-ble-plx
// import { BleManager, Device } from 'react-native-ble-plx';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// DHL Colors
const DHL_RED = '#D40511';
const DHL_YELLOW = '#FFCC00';

// BLE Service UUIDs para básculas industriales comunes
const SCALE_SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
const SCALE_CHARACTERISTIC_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';

interface Props {
  navigation: any;
}

type WizardStep = 'scan' | 'classify' | 'weight' | 'measure';

export default function DhlReceptionWizardScreen({ navigation }: Props) {
  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>('scan');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Form data
  const [tracking, setTracking] = useState('');
  const [productType, setProductType] = useState<'standard' | 'high_value' | null>(null);
  const [weight, setWeight] = useState(0);
  const [dimensions, setDimensions] = useState({ length: 0, width: 0, height: 0 });

  // Hardware state
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [bleConnected, setBleConnected] = useState(false);
  const [bleSearching, setBleSearching] = useState(false);
  const [photoTaken, setPhotoTaken] = useState(false);
  const [processingAI, setProcessingAI] = useState(false);

  // Refs
  const cameraRef = useRef<CameraView>(null);
  // BLE Manager - uncomment when react-native-ble-plx is installed
  // const bleManagerRef = useRef<BleManager | null>(null);
  // const connectedDeviceRef = useRef<Device | null>(null);

  // ===== PERMISSIONS =====
  useEffect(() => {
    (async () => {
      const { status: cameraStatus } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(cameraStatus === 'granted');
    })();

    // Initialize BLE Manager - uncomment when react-native-ble-plx is installed
    // bleManagerRef.current = new BleManager();

    return () => {
      // Cleanup BLE - uncomment when react-native-ble-plx is installed
      // if (connectedDeviceRef.current) {
      //   connectedDeviceRef.current.cancelConnection();
      // }
      // if (bleManagerRef.current) {
      //   bleManagerRef.current.destroy();
      // }
    };
  }, []);

  // ===== STEP 1: BARCODE SCANNER =====
  const handleBarCodeScanned = ({ data }: BarcodeScanningResult) => {
    if (scanned) return;
    
    setScanned(true);
    Vibration.vibrate(100);
    setTracking(data.toUpperCase());
    
    // Auto-advance to classification
    setTimeout(() => {
      setCurrentStep('classify');
    }, 500);
  };

  // ===== STEP 2: CLASSIFICATION =====
  const handleSelectType = (type: 'standard' | 'high_value') => {
    setProductType(type);
    Vibration.vibrate(50);
    
    setTimeout(() => {
      setCurrentStep('weight');
      // Start BLE scanning - uncomment when react-native-ble-plx is installed
      // scanForScales();
    }, 300);
  };

  // ===== STEP 3: BLUETOOTH SCALE =====
  // BLE functionality - uncomment when react-native-ble-plx is installed
  const scanForScales = async () => {
    // Placeholder for BLE scanning
    // Install react-native-ble-plx to enable: npm install react-native-ble-plx
    setBleSearching(true);
    
    // Simulate searching then show manual input
    setTimeout(() => {
      setBleSearching(false);
      Alert.alert(
        'Báscula BLE',
        'Para conectar una báscula Bluetooth, instala react-native-ble-plx.\nPor ahora, ingresa el peso manualmente.',
        [{ text: 'OK' }]
      );
    }, 2000);
  };

  /*
  // Full BLE implementation - uncomment when react-native-ble-plx is installed
  const scanForScales = async () => {
    if (!bleManagerRef.current) return;

    setBleSearching(true);

    // Check Bluetooth state
    const state = await bleManagerRef.current.state();
    if (state !== 'PoweredOn') {
      Alert.alert(
        'Bluetooth',
        'Por favor activa Bluetooth para conectar la báscula',
        [{ text: 'OK' }]
      );
      setBleSearching(false);
      return;
    }

    // Scan for devices
    bleManagerRef.current.startDeviceScan(
      [SCALE_SERVICE_UUID],
      { allowDuplicates: false },
      async (error: any, device: any) => {
        if (error) {
          console.error('BLE Scan error:', error);
          setBleSearching(false);
          return;
        }

        // Look for scale devices (common names)
        const deviceName = device?.name?.toLowerCase() || '';
        if (
          deviceName.includes('scale') ||
          deviceName.includes('torrey') ||
          deviceName.includes('rhino') ||
          deviceName.includes('crb') ||
          deviceName.includes('bascula')
        ) {
          bleManagerRef.current?.stopDeviceScan();
          await connectToScale(device!);
        }
      }
    );

    // Stop scanning after 10 seconds
    setTimeout(() => {
      bleManagerRef.current?.stopDeviceScan();
      setBleSearching(false);
    }, 10000);
  };

  const connectToScale = async (device: any) => {
    try {
      const connectedDevice = await device.connect();
      await connectedDevice.discoverAllServicesAndCharacteristics();
      
      connectedDeviceRef.current = connectedDevice;
      setBleConnected(true);
      setBleSearching(false);

      // Subscribe to weight notifications
      device.monitorCharacteristicForService(
        SCALE_SERVICE_UUID,
        SCALE_CHARACTERISTIC_UUID,
        (error: any, characteristic: any) => {
          if (error) {
            console.error('BLE Monitor error:', error);
            return;
          }

          if (characteristic?.value) {
            // Decode weight value (format varies by scale)
            const rawData = atob(characteristic.value);
            const weightMatch = rawData.match(/(\d+\.?\d*)/);
            
            if (weightMatch) {
              const weightValue = parseFloat(weightMatch[1]);
              setWeight(Math.round(weightValue * 100) / 100);
              
              // Auto-advance if weight is stable (> 0.1 kg)
              if (weightValue > 0.1) {
                setTimeout(() => {
                  setCurrentStep('measure');
                }, 2000);
              }
            }
          }
        }
      );
    } catch (error) {
      console.error('BLE Connect error:', error);
      Alert.alert('Error', 'No se pudo conectar a la báscula');
    }
  };
  */

  const handleManualWeight = () => {
    if (weight > 0) {
      setCurrentStep('measure');
    }
  };

  // ===== STEP 4: AI MEASUREMENTS =====
  const captureAndMeasure = async () => {
    if (!cameraRef.current) return;

    try {
      setProcessingAI(true);
      Vibration.vibrate(100);

      // Take photo
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,
      });

      if (!photo?.base64) {
        throw new Error('No se pudo capturar la foto');
      }

      setPhotoTaken(true);

      // Send to AI backend
      const token = await AsyncStorage.getItem('token');
      const measureResponse = await fetch(`${API_URL}/api/admin/dhl/measure-box`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ image: `data:image/jpeg;base64,${photo.base64}` })
      });
      const measureData = await measureResponse.json();

      if (measureData.success) {
        setDimensions({
          length: measureData.length_cm,
          width: measureData.width_cm,
          height: measureData.height_cm || 20,
        });
      }
    } catch (error) {
      console.error('AI Measure error:', error);
      Alert.alert(
        'Error',
        'No se pudieron calcular las medidas. Ingresa manualmente.',
      );
    } finally {
      setProcessingAI(false);
    }
  };

  // ===== SUBMIT =====
  const handleSubmit = async () => {
    if (!tracking || !productType || weight <= 0) {
      Alert.alert('Error', 'Faltan datos requeridos');
      return;
    }

    setLoading(true);

    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/admin/dhl/receive`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          inbound_tracking: tracking,
          product_type: productType,
          weight_kg: weight,
          length_cm: dimensions.length || 30,
          width_cm: dimensions.width || 20,
          height_cm: dimensions.height || 15,
          description: productType === 'standard' ? 'Accesorios/Mixto' : 'Refacciones Auto',
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al registrar');
      }

      setSuccess(true);
      Vibration.vibrate([0, 200, 100, 200]);

      // Reset and prepare for next package
      setTimeout(() => {
        resetWizard();
      }, 2000);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error al registrar');
    } finally {
      setLoading(false);
    }
  };

  const resetWizard = () => {
    setCurrentStep('scan');
    setTracking('');
    setProductType(null);
    setWeight(0);
    setDimensions({ length: 0, width: 0, height: 0 });
    setScanned(false);
    setPhotoTaken(false);
    setSuccess(false);
  };

  // ===== RENDER STEPS =====
  const renderStepIndicator = () => {
    const steps = ['scan', 'classify', 'weight', 'measure'];
    const currentIndex = steps.indexOf(currentStep);

    return (
      <View style={styles.stepIndicator}>
        {steps.map((step, index) => (
          <React.Fragment key={step}>
            <View
              style={[
                styles.stepDot,
                index <= currentIndex && styles.stepDotActive,
              ]}
            >
              {index < currentIndex ? (
                <Ionicons name="checkmark" size={16} color="#fff" />
              ) : (
                <Text style={styles.stepNumber}>{index + 1}</Text>
              )}
            </View>
            {index < steps.length - 1 && (
              <View
                style={[
                  styles.stepLine,
                  index < currentIndex && styles.stepLineActive,
                ]}
              />
            )}
          </React.Fragment>
        ))}
      </View>
    );
  };

  const renderContent = () => {
    if (success) {
      return (
        <View style={styles.successContainer}>
          <Ionicons name="checkmark-circle" size={120} color="#4caf50" />
          <Text style={styles.successText}>¡Paquete Guardado!</Text>
          <Text style={styles.successTracking}>{tracking}</Text>
          <Text style={styles.successHint}>Preparando siguiente...</Text>
        </View>
      );
    }

    switch (currentStep) {
      case 'scan':
        return renderScanStep();
      case 'classify':
        return renderClassifyStep();
      case 'weight':
        return renderWeightStep();
      case 'measure':
        return renderMeasureStep();
      default:
        return null;
    }
  };

  const renderScanStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Escanea el Tracking</Text>
      <Text style={styles.stepSubtitle}>Apunta al código de barras DHL</Text>

      {hasPermission ? (
        <View style={styles.cameraContainer}>
          <CameraView
            style={styles.camera}
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ['code128', 'code39', 'ean13', 'qr'],
            }}
          >
            <View style={styles.scanOverlay}>
              <View style={styles.scanFrame} />
            </View>
          </CameraView>
        </View>
      ) : (
        <View style={styles.noPermission}>
          <Ionicons name="close-circle-outline" size={60} color="#999" />
          <Text style={styles.noPermissionText}>
            Se requiere permiso de cámara
          </Text>
        </View>
      )}

      <Text style={styles.orText}>— o ingresa manualmente —</Text>
      <TextInput
        style={styles.input}
        value={tracking}
        onChangeText={(text) => setTracking(text.toUpperCase())}
        placeholder="Número de tracking"
        placeholderTextColor="#999"
        autoCapitalize="characters"
      />
      {tracking.length >= 5 && (
        <TouchableOpacity
          style={styles.continueButton}
          onPress={() => setCurrentStep('classify')}
        >
          <Text style={styles.continueButtonText}>Continuar</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderClassifyStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Tipo de Producto</Text>
      <Text style={styles.stepSubtitle}>Selecciona la categoría</Text>

      <View style={styles.classifyButtons}>
        <TouchableOpacity
          style={[
            styles.classifyButton,
            productType === 'standard' && styles.classifyButtonActive,
          ]}
          onPress={() => handleSelectType('standard')}
        >
          <Ionicons name="shirt-outline" size={60} color={DHL_RED} />
          <Text style={styles.classifyButtonTitle}>Standard</Text>
          <Text style={styles.classifyButtonSubtitle}>Accesorios / Mixto</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.classifyButton,
            productType === 'high_value' && styles.classifyButtonActiveYellow,
          ]}
          onPress={() => handleSelectType('high_value')}
        >
          <Ionicons name="construct-outline" size={60} color="#ff9800" />
          <Text style={styles.classifyButtonTitle}>High Value</Text>
          <Text style={styles.classifyButtonSubtitle}>Refacciones Auto</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderWeightStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Peso del Paquete</Text>
      <Text style={styles.stepSubtitle}>Coloca la caja en la báscula</Text>

      {/* BLE Status */}
      <View style={styles.bleStatus}>
        {bleConnected ? (
          <View style={styles.bleConnected}>
            <Ionicons name="bluetooth" size={24} color="#4caf50" />
            <Text style={styles.bleConnectedText}>Báscula conectada</Text>
          </View>
        ) : bleSearching ? (
          <View style={styles.bleSearching}>
            <ActivityIndicator color={DHL_RED} />
            <Text style={styles.bleSearchingText}>Buscando báscula...</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.bleConnect} onPress={scanForScales}>
            <Ionicons name="bluetooth" size={24} color="#666" />
            <Text style={styles.bleConnectText}>Conectar Báscula</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Weight Display */}
      <View style={styles.weightDisplay}>
        <Text style={styles.weightValue}>{weight.toFixed(2)}</Text>
        <Text style={styles.weightUnit}>kg</Text>
      </View>

      {/* Manual Input */}
      <Text style={styles.orText}>— o ingresa manualmente —</Text>
      <TextInput
        style={styles.weightInput}
        value={weight ? weight.toString() : ''}
        onChangeText={(text) => setWeight(parseFloat(text) || 0)}
        placeholder="0.00"
        placeholderTextColor="#666"
        keyboardType="decimal-pad"
      />
      <TouchableOpacity
        style={[styles.continueButton, weight <= 0 && styles.buttonDisabled]}
        onPress={handleManualWeight}
        disabled={weight <= 0}
      >
        <Text style={styles.continueButtonText}>Continuar</Text>
      </TouchableOpacity>
    </View>
  );

  const renderMeasureStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Medidas del Paquete</Text>
      <Text style={styles.stepSubtitle}>
        {photoTaken ? 'Verifica las medidas' : 'Centra la caja y toma foto'}
      </Text>

      {!photoTaken ? (
        <>
          <View style={styles.measureCameraContainer}>
            <CameraView ref={cameraRef} style={styles.measureCamera}>
              {/* Green guide overlay */}
              <View style={styles.measureGuide}>
                <View style={styles.measureFrame}>
                  <Text style={styles.measureFrameText}>📦 Centra aquí</Text>
                </View>
              </View>
              {processingAI && (
                <View style={styles.processingOverlay}>
                  <ActivityIndicator size="large" color="#4caf50" />
                  <Text style={styles.processingText}>
                    Calculando medidas con IA...
                  </Text>
                </View>
              )}
            </CameraView>
          </View>
          <TouchableOpacity
            style={styles.captureButton}
            onPress={captureAndMeasure}
            disabled={processingAI}
          >
            <Ionicons name="camera" size={32} color="#fff" />
            <Text style={styles.captureButtonText}>Tomar Foto</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          {/* Dimension inputs */}
          <View style={styles.dimensionInputs}>
            <View style={styles.dimensionInput}>
              <Text style={styles.dimensionLabel}>Largo</Text>
              <TextInput
                style={styles.dimensionField}
                value={dimensions.length ? dimensions.length.toString() : ''}
                onChangeText={(t) =>
                  setDimensions({ ...dimensions, length: parseFloat(t) || 0 })
                }
                keyboardType="decimal-pad"
              />
              <Text style={styles.dimensionUnit}>cm</Text>
            </View>
            <View style={styles.dimensionInput}>
              <Text style={styles.dimensionLabel}>Ancho</Text>
              <TextInput
                style={styles.dimensionField}
                value={dimensions.width ? dimensions.width.toString() : ''}
                onChangeText={(t) =>
                  setDimensions({ ...dimensions, width: parseFloat(t) || 0 })
                }
                keyboardType="decimal-pad"
              />
              <Text style={styles.dimensionUnit}>cm</Text>
            </View>
            <View style={styles.dimensionInput}>
              <Text style={styles.dimensionLabel}>Alto</Text>
              <TextInput
                style={styles.dimensionField}
                value={dimensions.height ? dimensions.height.toString() : ''}
                onChangeText={(t) =>
                  setDimensions({ ...dimensions, height: parseFloat(t) || 0 })
                }
                keyboardType="decimal-pad"
              />
              <Text style={styles.dimensionUnit}>cm</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.retakeButton}
            onPress={() => setPhotoTaken(false)}
          >
            <Ionicons name="refresh" size={20} color="#666" />
            <Text style={styles.retakeButtonText}>Volver a Tomar</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Submit Button */}
      <TouchableOpacity
        style={[styles.submitButton, loading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={24} color="#fff" />
            <Text style={styles.submitButtonText}>Guardar Paquete</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  // ===== RENDER =====
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Ionicons name="cube-outline" size={28} color="#fff" />
          <Text style={styles.headerText}>Recepción DHL</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {/* Step Indicator */}
      {renderStepIndicator()}

      {/* Content */}
      {renderContent()}

      {/* Summary Bar */}
      {currentStep !== 'scan' && !success && (
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Tracking</Text>
            <Text style={styles.summaryValue}>{tracking}</Text>
          </View>
          {productType && (
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Tipo</Text>
              <Text style={styles.summaryValue}>
                {productType === 'standard' ? '👕' : '⚙️'}
              </Text>
            </View>
          )}
          {weight > 0 && (
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Peso</Text>
              <Text style={styles.summaryValue}>{weight} kg</Text>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: DHL_RED,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerSpacer: {
    width: 40,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 40,
  },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    backgroundColor: DHL_RED,
  },
  stepNumber: {
    color: '#666',
    fontWeight: 'bold',
  },
  stepLine: {
    flex: 1,
    height: 3,
    backgroundColor: '#ddd',
    marginHorizontal: 8,
  },
  stepLineActive: {
    backgroundColor: DHL_RED,
  },
  stepContent: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  cameraContainer: {
    width: SCREEN_WIDTH - 40,
    height: 250,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
  },
  camera: {
    flex: 1,
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 200,
    height: 100,
    borderWidth: 3,
    borderColor: DHL_YELLOW,
    borderRadius: 12,
  },
  noPermission: {
    width: SCREEN_WIDTH - 40,
    height: 200,
    backgroundColor: '#eee',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  noPermissionText: {
    marginTop: 12,
    color: '#999',
    fontSize: 16,
  },
  orText: {
    color: '#999',
    marginVertical: 16,
  },
  input: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  continueButton: {
    backgroundColor: DHL_RED,
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 30,
    marginTop: 20,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  classifyButtons: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 20,
  },
  classifyButton: {
    width: 160,
    padding: 24,
    backgroundColor: '#fff',
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  classifyButtonActive: {
    borderColor: DHL_RED,
    backgroundColor: '#fff5f5',
  },
  classifyButtonActiveYellow: {
    borderColor: DHL_YELLOW,
    backgroundColor: '#fffef5',
  },
  classifyButtonTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 12,
    color: '#333',
  },
  classifyButtonSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  bleStatus: {
    marginBottom: 24,
  },
  bleConnected: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    gap: 8,
  },
  bleConnectedText: {
    color: '#4caf50',
    fontWeight: '600',
  },
  bleSearching: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3e0',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    gap: 8,
  },
  bleSearchingText: {
    color: '#ff9800',
  },
  bleConnect: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    gap: 8,
  },
  bleConnectText: {
    color: '#666',
  },
  weightDisplay: {
    backgroundColor: '#111',
    paddingHorizontal: 60,
    paddingVertical: 30,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  weightValue: {
    fontSize: 64,
    fontWeight: 'bold',
    color: '#0f0',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  weightUnit: {
    fontSize: 24,
    color: '#0f0',
  },
  weightInput: {
    width: 150,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  measureCameraContainer: {
    width: SCREEN_WIDTH - 40,
    height: 300,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  measureCamera: {
    flex: 1,
  },
  measureGuide: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  measureFrame: {
    width: '70%',
    height: '60%',
    borderWidth: 3,
    borderColor: '#4caf50',
    borderStyle: 'dashed',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  measureFrameText: {
    color: '#4caf50',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingText: {
    color: '#fff',
    marginTop: 12,
  },
  captureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DHL_RED,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 30,
    gap: 8,
  },
  captureButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  dimensionInputs: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    marginBottom: 16,
  },
  dimensionInput: {
    alignItems: 'center',
  },
  dimensionLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  dimensionField: {
    width: 80,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  dimensionUnit: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  retakeButtonText: {
    color: '#666',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4caf50',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 30,
    gap: 8,
    marginTop: 24,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4caf50',
    marginTop: 16,
  },
  successTracking: {
    fontSize: 18,
    color: '#666',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 8,
  },
  successHint: {
    fontSize: 14,
    color: '#999',
    marginTop: 24,
  },
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: '#111',
    padding: 16,
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 10,
    color: '#999',
  },
  summaryValue: {
    fontSize: 14,
    color: '#fff',
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
