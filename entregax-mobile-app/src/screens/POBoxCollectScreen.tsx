/**
 * POBoxCollectScreen - Wizard de Cobrar / Recibir Pagos
 * Permite buscar paquetes por referencia y procesar pagos
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#111111';
const GREEN = '#4CAF50';

interface Package {
  id: number;
  tracking_number: string;
  weight_kg?: number;
  status: string;
  cost_details?: {
    shipping?: number;
    insurance?: number;
    handling?: number;
    total?: number;
  };
  user?: {
    full_name: string;
    box_id: string;
    email: string;
  };
  pending_amount?: number;
}

interface Props {
  navigation: any;
  route: {
    params: {
      user: any;
      token: string;
    };
  };
}

export default function POBoxCollectScreen({ navigation, route }: Props) {
  const { user, token } = route.params;
  const [step, setStep] = useState(0); // 0: Buscar, 1: Detalles de Cobro, 2: Procesar Pago
  const [loading, setLoading] = useState(false);
  
  // Búsqueda
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [searchResults, setSearchResults] = useState<Package[]>([]);
  
  // Pago
  const [metodoPago, setMetodoPago] = useState('');
  const [referenciaPago, setReferenciaPago] = useState('');
  const [montoPagado, setMontoPagado] = useState('');
  const [observaciones, setObservaciones] = useState('');
  
  const searchInputRef = useRef<TextInput>(null);
  
  // Scanner
  const [showScanner, setShowScanner] = useState(false);
  const [scannerReady, setScannerReady] = useState(true);
  const [permission, requestPermission] = useCameraPermissions();

  // Abrir escáner
  const abrirScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permiso Requerido', 'Se necesita acceso a la cámara para escanear códigos de barras');
        return;
      }
    }
    setScannerReady(true);
    setShowScanner(true);
  };

  // Manejar código escaneado
  const handleBarCodeScanned = (result: BarcodeScanningResult) => {
    if (!scannerReady) return;
    
    setScannerReady(false);
    Vibration.vibrate(100);
    
    const scannedCode = result.data.trim();
    setSearchQuery(scannedCode);
    setShowScanner(false);
    
    // Buscar automáticamente
    setTimeout(() => {
      buscarPaquete();
      setScannerReady(true);
    }, 500);
  };

  const metodosPago = [
    { id: 'efectivo', nombre: 'Efectivo', icon: 'cash' },
    { id: 'tarjeta', nombre: 'Tarjeta', icon: 'card' },
    { id: 'transferencia', nombre: 'Transferencia', icon: 'swap-horizontal' },
    { id: 'zelle', nombre: 'Zelle', icon: 'phone-portrait' },
  ];

  const buscarPaquete = async () => {
    if (!searchQuery.trim()) {
      Alert.alert('Error', 'Ingresa una referencia para buscar');
      return;
    }
    
    setSearching(true);
    setSearchResults([]);
    setSelectedPackage(null);
    
    try {
      const response = await fetch(
        `${API_URL}/api/packages/search?q=${searchQuery.trim()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.ok) {
        const data = await response.json();
        const packages = Array.isArray(data) ? data : data.packages || [data];
        
        if (packages.length > 0) {
          setSearchResults(packages);
        } else {
          Alert.alert('No encontrado', 'No se encontraron paquetes con esa referencia');
        }
      } else {
        Alert.alert('Error', 'No se pudo buscar el paquete');
      }
    } catch (error) {
      console.error('Error buscando paquete:', error);
      Alert.alert('Error', 'No se pudo realizar la búsqueda');
    } finally {
      setSearching(false);
    }
  };

  const seleccionarPaquete = (pkg: Package) => {
    setSelectedPackage(pkg);
    // Pre-llenar el monto con el pendiente
    const pendiente = pkg.pending_amount || pkg.cost_details?.total || 0;
    setMontoPagado(pendiente.toFixed(2));
    setStep(1);
  };

  const calcularPendiente = () => {
    if (!selectedPackage) return 0;
    return selectedPackage.pending_amount || selectedPackage.cost_details?.total || 0;
  };

  const procesarPago = async () => {
    if (!metodoPago) {
      Alert.alert('Error', 'Selecciona un método de pago');
      return;
    }
    if (!montoPagado || parseFloat(montoPagado) <= 0) {
      Alert.alert('Error', 'Ingresa un monto válido');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        package_id: selectedPackage?.id,
        amount: parseFloat(montoPagado),
        payment_method: metodoPago,
        reference: referenciaPago,
        notes: observaciones,
        received_by: user.id,
        received_at: new Date().toISOString(),
      };

      const response = await fetch(`${API_URL}/api/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        Alert.alert(
          '✅ Pago Registrado',
          `Se registró el pago de $${montoPagado} USD para ${selectedPackage?.tracking_number}`,
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        throw new Error('Error al procesar pago');
      }
    } catch (error) {
      console.error('Error procesando pago:', error);
      Alert.alert('Error', 'No se pudo procesar el pago');
    } finally {
      setLoading(false);
    }
  };

  const renderStep0 = () => (
    <ScrollView style={styles.stepContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.stepTitle}>🔍 Buscar por Referencia</Text>
      <Text style={styles.stepSubtitle}>
        Busca por guía, Box ID del cliente o nombre
      </Text>

      {/* Campo de búsqueda */}
      <View style={styles.searchContainer}>
        <TextInput
          ref={searchInputRef}
          style={[styles.searchInput, { flex: 1 }]}
          placeholder="Guía, Box ID o nombre del cliente..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="characters"
          onSubmitEditing={buscarPaquete}
        />
        <TouchableOpacity 
          style={styles.scanButton} 
          onPress={abrirScanner}
        >
          <Ionicons name="barcode-outline" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.searchButton} 
          onPress={buscarPaquete}
          disabled={searching}
        >
          {searching ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Ionicons name="search" size={24} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      {/* Sugerencias rápidas */}
      <View style={styles.quickTips}>
        <Text style={styles.quickTipsTitle}>💡 Puedes buscar por:</Text>
        <Text style={styles.quickTip}>• Número de guía (ej: US-ABC123)</Text>
        <Text style={styles.quickTip}>• Box ID del cliente (ej: S-0001)</Text>
        <Text style={styles.quickTip}>• Nombre del cliente</Text>
      </View>

      {/* Resultados */}
      {searchResults.length > 0 && (
        <View style={styles.resultsContainer}>
          <Text style={styles.resultsTitle}>
            Resultados ({searchResults.length})
          </Text>
          
          {searchResults.map(pkg => (
            <TouchableOpacity 
              key={pkg.id}
              style={styles.resultItem}
              onPress={() => seleccionarPaquete(pkg)}
            >
              <View style={styles.resultIcon}>
                <Ionicons name="cube" size={24} color={ORANGE} />
              </View>
              <View style={styles.resultInfo}>
                <Text style={styles.resultTracking}>{pkg.tracking_number}</Text>
                {pkg.user && (
                  <Text style={styles.resultUser}>
                    {pkg.user.full_name} • {pkg.user.box_id}
                  </Text>
                )}
                <View style={styles.resultDetails}>
                  <Text style={styles.resultStatus}>{pkg.status}</Text>
                  <Text style={styles.resultPendiente}>
                    Pendiente: ${(pkg.pending_amount || pkg.cost_details?.total || 0).toFixed(2)}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#ccc" />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );

  const renderStep1 = () => (
    <ScrollView style={styles.stepContent}>
      <Text style={styles.stepTitle}>💰 Detalles de Cobro</Text>
      <Text style={styles.stepSubtitle}>
        Revisa los cargos y el monto a cobrar
      </Text>

      {/* Info del paquete */}
      <View style={styles.packageCard}>
        <View style={styles.packageHeader}>
          <Ionicons name="cube" size={32} color={ORANGE} />
          <View style={styles.packageHeaderInfo}>
            <Text style={styles.packageTracking}>
              {selectedPackage?.tracking_number}
            </Text>
            {selectedPackage?.user && (
              <Text style={styles.packageUser}>
                {selectedPackage.user.full_name} • {selectedPackage.user.box_id}
              </Text>
            )}
          </View>
        </View>

        {/* Desglose de cargos */}
        <View style={styles.chargesSection}>
          <Text style={styles.chargesTitle}>Desglose de Cargos</Text>
          <View style={styles.chargeRow}>
            <Text style={styles.chargeLabel}>Envío</Text>
            <Text style={styles.chargeValue}>
              ${(selectedPackage?.cost_details?.shipping || 0).toFixed(2)}
            </Text>
          </View>
          <View style={styles.chargeRow}>
            <Text style={styles.chargeLabel}>Seguro</Text>
            <Text style={styles.chargeValue}>
              ${(selectedPackage?.cost_details?.insurance || 0).toFixed(2)}
            </Text>
          </View>
          <View style={styles.chargeRow}>
            <Text style={styles.chargeLabel}>Manejo</Text>
            <Text style={styles.chargeValue}>
              ${(selectedPackage?.cost_details?.handling || 0).toFixed(2)}
            </Text>
          </View>
          <View style={[styles.chargeRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total a Cobrar</Text>
            <Text style={styles.totalValue}>
              ${calcularPendiente().toFixed(2)} USD
            </Text>
          </View>
        </View>
      </View>

      {/* Método de pago */}
      <View style={styles.paymentSection}>
        <Text style={styles.inputLabel}>Método de Pago</Text>
        <View style={styles.paymentMethods}>
          {metodosPago.map(metodo => (
            <TouchableOpacity 
              key={metodo.id}
              style={[
                styles.paymentMethod,
                metodoPago === metodo.id && styles.paymentMethodActive
              ]}
              onPress={() => setMetodoPago(metodo.id)}
            >
              <Ionicons 
                name={metodo.icon as any} 
                size={24} 
                color={metodoPago === metodo.id ? '#fff' : ORANGE} 
              />
              <Text style={[
                styles.paymentMethodText,
                metodoPago === metodo.id && styles.paymentMethodTextActive
              ]}>
                {metodo.nombre}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Monto */}
      <View style={styles.amountSection}>
        <Text style={styles.inputLabel}>Monto Recibido (USD)</Text>
        <View style={styles.amountInputContainer}>
          <Text style={styles.currencySymbol}>$</Text>
          <TextInput
            style={styles.amountInput}
            placeholder="0.00"
            value={montoPagado}
            onChangeText={setMontoPagado}
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      {/* Referencia */}
      <View style={styles.formGroup}>
        <Text style={styles.inputLabel}>Referencia de Pago (opcional)</Text>
        <TextInput
          style={styles.input}
          placeholder="Número de transacción, recibo, etc..."
          value={referenciaPago}
          onChangeText={setReferenciaPago}
        />
      </View>
    </ScrollView>
  );

  const renderStep2 = () => (
    <ScrollView style={styles.stepContent}>
      <Text style={styles.stepTitle}>✅ Confirmar Pago</Text>
      <Text style={styles.stepSubtitle}>
        Revisa los datos antes de registrar el pago
      </Text>

      {/* Resumen visual */}
      <View style={styles.confirmCard}>
        <View style={styles.confirmAmount}>
          <Text style={styles.confirmCurrency}>$</Text>
          <Text style={styles.confirmAmountValue}>{montoPagado}</Text>
          <Text style={styles.confirmAmountCurrency}>USD</Text>
        </View>
        <Text style={styles.confirmMethod}>
          Pago en {metodosPago.find(m => m.id === metodoPago)?.nombre}
        </Text>
      </View>

      {/* Detalles */}
      <View style={styles.confirmDetails}>
        <View style={styles.confirmRow}>
          <Text style={styles.confirmLabel}>Paquete:</Text>
          <Text style={styles.confirmValue}>{selectedPackage?.tracking_number}</Text>
        </View>
        <View style={styles.confirmRow}>
          <Text style={styles.confirmLabel}>Cliente:</Text>
          <Text style={styles.confirmValue}>
            {selectedPackage?.user?.full_name || 'N/A'}
          </Text>
        </View>
        <View style={styles.confirmRow}>
          <Text style={styles.confirmLabel}>Box ID:</Text>
          <Text style={styles.confirmValue}>
            {selectedPackage?.user?.box_id || 'N/A'}
          </Text>
        </View>
        <View style={styles.confirmRow}>
          <Text style={styles.confirmLabel}>Referencia:</Text>
          <Text style={styles.confirmValue}>{referenciaPago || 'No especificada'}</Text>
        </View>
        <View style={styles.confirmRow}>
          <Text style={styles.confirmLabel}>Recibido por:</Text>
          <Text style={styles.confirmValue}>{user.full_name || user.name}</Text>
        </View>
      </View>

      {/* Observaciones */}
      <View style={styles.formGroup}>
        <Text style={styles.inputLabel}>Observaciones (opcional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Notas adicionales..."
          value={observaciones}
          onChangeText={setObservaciones}
          multiline
          numberOfLines={3}
        />
      </View>
    </ScrollView>
  );

  const getCurrentStepValid = () => {
    switch (step) {
      case 0: return selectedPackage !== null;
      case 1: return metodoPago !== '' && parseFloat(montoPagado) > 0;
      case 2: return true;
      default: return false;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Ionicons name="cash" size={24} color="#fff" />
          <Text style={styles.headerTitle}>Cobrar</Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

      {/* Stepper */}
      <View style={styles.stepper}>
        {[0, 1, 2].map((s, idx) => (
          <React.Fragment key={s}>
            <TouchableOpacity 
              style={[styles.stepDot, step >= s && styles.stepDotActive]}
              onPress={() => {
                if (s < step) setStep(s);
              }}
            >
              <Text style={[styles.stepNumber, step >= s && styles.stepNumberActive]}>
                {s + 1}
              </Text>
            </TouchableOpacity>
            {idx < 2 && <View style={[styles.stepLine, step > s && styles.stepLineActive]} />}
          </React.Fragment>
        ))}
      </View>
      <View style={styles.stepperLabels}>
        <Text style={[styles.stepLabel, step === 0 && styles.stepLabelActive]}>Buscar</Text>
        <Text style={[styles.stepLabel, step === 1 && styles.stepLabelActive]}>Detalles</Text>
        <Text style={[styles.stepLabel, step === 2 && styles.stepLabelActive]}>Confirmar</Text>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
      </KeyboardAvoidingView>

      {/* Footer */}
      <View style={styles.footer}>
        {step === 1 && (
          <View style={styles.footerButtons}>
            <TouchableOpacity style={styles.backButton} onPress={() => setStep(0)}>
              <Text style={styles.backButtonText}>Atrás</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.nextButton, { flex: 2 }, !getCurrentStepValid() && styles.buttonDisabled]}
              onPress={() => setStep(2)}
              disabled={!getCurrentStepValid()}
            >
              <Text style={styles.nextButtonText}>Continuar</Text>
              <Ionicons name="arrow-forward" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
        {step === 2 && (
          <View style={styles.footerButtons}>
            <TouchableOpacity style={styles.backButton} onPress={() => setStep(1)}>
              <Text style={styles.backButtonText}>Atrás</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.processButton, loading && styles.buttonDisabled]}
              onPress={procesarPago}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.processButtonText}>Registrar Pago</Text>
                  <Ionicons name="checkmark-circle" size={24} color="#fff" />
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Modal Scanner */}
      <Modal
        visible={showScanner}
        animationType="slide"
        onRequestClose={() => setShowScanner(false)}
      >
        <SafeAreaView style={styles.scannerContainer}>
          <View style={styles.scannerHeader}>
            <TouchableOpacity onPress={() => setShowScanner(false)}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.scannerTitle}>Escanear Código de Barras</Text>
            <View style={{ width: 28 }} />
          </View>
          
          <View style={styles.scannerArea}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'code93', 'upc_a', 'upc_e', 'itf14', 'codabar', 'datamatrix', 'pdf417'],
              }}
              onBarcodeScanned={scannerReady ? handleBarCodeScanned : undefined}
            />
            <View style={styles.scannerOverlay}>
              <View style={styles.scannerFrame}>
                <View style={[styles.scannerCorner, styles.topLeft]} />
                <View style={[styles.scannerCorner, styles.topRight]} />
                <View style={[styles.scannerCorner, styles.bottomLeft]} />
                <View style={[styles.scannerCorner, styles.bottomRight]} />
              </View>
            </View>
          </View>
          
          <View style={styles.scannerFooter}>
            <Ionicons name="barcode-outline" size={32} color={GREEN} />
            <Text style={styles.scannerHint}>
              Apunta la cámara al código de barras del paquete
            </Text>
          </View>
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
  header: {
    backgroundColor: GREEN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    backgroundColor: '#fff',
  },
  stepDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  stepNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999',
  },
  stepNumberActive: {
    color: '#fff',
  },
  stepLine: {
    width: 60,
    height: 2,
    backgroundColor: '#ddd',
    marginHorizontal: 8,
  },
  stepLineActive: {
    backgroundColor: GREEN,
  },
  stepperLabels: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  stepLabel: {
    fontSize: 13,
    color: '#999',
  },
  stepLabelActive: {
    color: GREEN,
    fontWeight: '600',
  },
  stepContent: {
    flex: 1,
    padding: 16,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: BLACK,
    marginBottom: 4,
  },
  stepSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  searchContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  searchButton: {
    backgroundColor: GREEN,
    width: 56,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTips: {
    backgroundColor: '#e8f5e9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  quickTipsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: GREEN,
    marginBottom: 8,
  },
  quickTip: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  resultsContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: BLACK,
    marginBottom: 12,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  resultIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff3e0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  resultInfo: {
    flex: 1,
  },
  resultTracking: {
    fontSize: 15,
    fontWeight: '600',
    color: BLACK,
  },
  resultUser: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  resultDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  resultStatus: {
    fontSize: 12,
    color: '#999',
  },
  resultPendiente: {
    fontSize: 12,
    fontWeight: '600',
    color: GREEN,
  },
  packageCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  packageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  packageHeaderInfo: {
    flex: 1,
  },
  packageTracking: {
    fontSize: 18,
    fontWeight: '700',
    color: BLACK,
  },
  packageUser: {
    fontSize: 14,
    color: '#666',
  },
  chargesSection: {
    marginTop: 16,
  },
  chargesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  chargeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  chargeLabel: {
    fontSize: 14,
    color: '#666',
  },
  chargeValue: {
    fontSize: 14,
    color: BLACK,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    marginTop: 8,
    paddingTop: 12,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: BLACK,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: GREEN,
  },
  paymentSection: {
    marginBottom: 20,
  },
  paymentMethods: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  paymentMethod: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: ORANGE,
    backgroundColor: '#fff',
    gap: 8,
  },
  paymentMethodActive: {
    backgroundColor: ORANGE,
  },
  paymentMethodText: {
    fontSize: 14,
    fontWeight: '600',
    color: ORANGE,
  },
  paymentMethodTextActive: {
    color: '#fff',
  },
  amountSection: {
    marginBottom: 20,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 16,
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: '700',
    color: GREEN,
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '600',
    paddingVertical: 14,
    color: BLACK,
  },
  formGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  confirmCard: {
    backgroundColor: GREEN,
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    marginBottom: 20,
  },
  confirmAmount: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  confirmCurrency: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    marginTop: 8,
  },
  confirmAmountValue: {
    fontSize: 56,
    fontWeight: '700',
    color: '#fff',
  },
  confirmAmountCurrency: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginTop: 8,
    marginLeft: 4,
  },
  confirmMethod: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 8,
  },
  confirmDetails: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  confirmLabel: {
    fontSize: 14,
    color: '#666',
  },
  confirmValue: {
    fontSize: 14,
    fontWeight: '500',
    color: BLACK,
  },
  footer: {
    backgroundColor: '#fff',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  footerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  backButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  backButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    flex: 1,
    backgroundColor: GREEN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  processButton: {
    flex: 2,
    backgroundColor: GREEN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  processButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  // Scanner styles
  scanButton: {
    backgroundColor: GREEN,
    width: 50,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: GREEN,
  },
  scannerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  scannerArea: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerFrame: {
    width: 280,
    height: 180,
    position: 'relative',
  },
  scannerCorner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: GREEN,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 8,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 8,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 8,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 8,
  },
  scannerFooter: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  scannerHint: {
    marginTop: 8,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});
