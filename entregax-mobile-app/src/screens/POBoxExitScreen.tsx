/**
 * POBoxExitScreen - Wizard de Nueva Salida de Paquetes
 * Permite crear una salida/envío de paquetes a México
 */

import React, { useState, useEffect } from 'react';
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
  FlatList,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#111111';

interface Package {
  id: number;
  tracking_number: string;
  weight_kg?: number;
  user?: {
    full_name: string;
    box_id: string;
  };
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

export default function POBoxExitScreen({ navigation, route }: Props) {
  const { user, token } = route.params;
  const [step, setStep] = useState(0); // 0: Seleccionar Paquetes, 1: Datos de Envío, 2: Confirmar
  const [loading, setLoading] = useState(false);
  
  // Búsqueda y selección
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [availablePackages, setAvailablePackages] = useState<Package[]>([]);
  const [selectedPackages, setSelectedPackages] = useState<Package[]>([]);
  
  // Datos de envío
  const [metodoEnvio, setMetodoEnvio] = useState('consolidado');
  const [paqueteria, setPaqueteria] = useState('');
  const [guiaMaster, setGuiaMaster] = useState('');
  const [destino, setDestino] = useState('');
  const [observaciones, setObservaciones] = useState('');
  
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
    
    // Buscar y agregar automáticamente
    setTimeout(() => {
      buscarPaquete();
      setScannerReady(true);
    }, 500);
  };
  
  // Paqueterías disponibles
  const paqueterias = [
    { id: 'dhl', nombre: 'DHL Express' },
    { id: 'fedex', nombre: 'FedEx' },
    { id: 'ups', nombre: 'UPS' },
    { id: 'estafeta', nombre: 'Estafeta' },
    { id: 'paquetexpress', nombre: 'Paquete Express' },
    { id: 'otro', nombre: 'Otro' },
  ];

  useEffect(() => {
    cargarPaquetesDisponibles();
  }, []);

  const cargarPaquetesDisponibles = async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/packages?status=in_warehouse_usa&limit=100`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.ok) {
        const data = await response.json();
        setAvailablePackages(data.packages || data || []);
      }
    } catch (error) {
      console.error('Error cargando paquetes:', error);
    }
  };

  const buscarPaquete = async () => {
    if (!searchQuery.trim()) return;
    
    setSearching(true);
    try {
      const response = await fetch(
        `${API_URL}/api/packages/search?q=${searchQuery.trim()}&status=in_warehouse_usa`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.ok) {
        const data = await response.json();
        const packages = Array.isArray(data) ? data : data.packages || [];
        
        if (packages.length > 0) {
          // Agregar a seleccionados si no están ya
          const nuevos = packages.filter(
            (p: Package) => !selectedPackages.find(sp => sp.id === p.id)
          );
          if (nuevos.length > 0) {
            setSelectedPackages([...selectedPackages, ...nuevos]);
            setSearchQuery('');
          } else {
            Alert.alert('Info', 'El paquete ya está seleccionado');
          }
        } else {
          Alert.alert('No encontrado', 'No se encontró el paquete o no está disponible para salida');
        }
      }
    } catch (error) {
      console.error('Error buscando paquete:', error);
      Alert.alert('Error', 'No se pudo buscar el paquete');
    } finally {
      setSearching(false);
    }
  };

  const togglePackageSelection = (pkg: Package) => {
    const isSelected = selectedPackages.find(p => p.id === pkg.id);
    if (isSelected) {
      setSelectedPackages(selectedPackages.filter(p => p.id !== pkg.id));
    } else {
      setSelectedPackages([...selectedPackages, pkg]);
    }
  };

  const calcularPesoTotal = () => {
    return selectedPackages.reduce((sum, p) => sum + (p.weight_kg || 0), 0);
  };

  const procesarSalida = async () => {
    if (selectedPackages.length === 0) {
      Alert.alert('Error', 'Selecciona al menos un paquete');
      return;
    }
    if (!paqueteria) {
      Alert.alert('Error', 'Selecciona una paquetería');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        packages: selectedPackages.map(p => p.id),
        carrier: paqueteria,
        master_tracking: guiaMaster,
        shipping_method: metodoEnvio,
        destination: destino,
        notes: observaciones,
        shipped_by: user.id,
        shipped_at: new Date().toISOString(),
      };

      const response = await fetch(`${API_URL}/api/shipments/outbound`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const result = await response.json();
        Alert.alert(
          '✅ Salida Procesada',
          `Se creó el envío con ${selectedPackages.length} paquete(s)\nGuía: ${result.tracking || guiaMaster || 'N/A'}`,
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        throw new Error('Error al procesar salida');
      }
    } catch (error) {
      console.error('Error procesando salida:', error);
      Alert.alert('Error', 'No se pudo procesar la salida');
    } finally {
      setLoading(false);
    }
  };

  const renderStep0 = () => (
    <ScrollView style={styles.stepContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.stepTitle}>📦 Seleccionar Paquetes</Text>
      <Text style={styles.stepSubtitle}>
        Escanea o busca los paquetes para esta salida
      </Text>

      {/* Buscador */}
      <View style={styles.searchContainer}>
        <TextInput
          style={[styles.searchInput, { flex: 1 }]}
          placeholder="Escanea o escribe guía..."
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
            <Ionicons name="add" size={24} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      {/* Paquetes seleccionados */}
      {selectedPackages.length > 0 && (
        <View style={styles.selectedSection}>
          <View style={styles.selectedHeader}>
            <Text style={styles.selectedTitle}>
              Paquetes a enviar ({selectedPackages.length})
            </Text>
            <Text style={styles.selectedWeight}>
              {calcularPesoTotal().toFixed(2)} kg total
            </Text>
          </View>
          
          {selectedPackages.map((pkg, index) => (
            <View key={pkg.id} style={styles.packageItem}>
              <Text style={styles.packageIndex}>#{index + 1}</Text>
              <View style={styles.packageInfo}>
                <Text style={styles.packageTracking}>{pkg.tracking_number}</Text>
                {pkg.user && (
                  <Text style={styles.packageUser}>
                    {pkg.user.full_name} • {pkg.user.box_id}
                  </Text>
                )}
                <Text style={styles.packageWeight}>
                  {pkg.weight_kg ? `${pkg.weight_kg} kg` : 'Sin peso'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => togglePackageSelection(pkg)}>
                <Ionicons name="close-circle" size={24} color="#f44336" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Paquetes disponibles */}
      <View style={styles.availableSection}>
        <Text style={styles.availableTitle}>
          Paquetes en bodega ({availablePackages.length})
        </Text>
        <Text style={styles.availableHint}>
          Toca para agregar a la salida
        </Text>
        
        {availablePackages.slice(0, 10).map(pkg => {
          const isSelected = selectedPackages.find(p => p.id === pkg.id);
          if (isSelected) return null;
          
          return (
            <TouchableOpacity 
              key={pkg.id} 
              style={styles.availableItem}
              onPress={() => togglePackageSelection(pkg)}
            >
              <Ionicons name="add-circle-outline" size={24} color={ORANGE} />
              <View style={styles.availableInfo}>
                <Text style={styles.availableTracking}>{pkg.tracking_number}</Text>
                {pkg.user && (
                  <Text style={styles.availableUser}>{pkg.user.box_id}</Text>
                )}
              </View>
              <Text style={styles.availableWeight}>
                {pkg.weight_kg ? `${pkg.weight_kg} kg` : '-'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );

  const renderStep1 = () => (
    <ScrollView style={styles.stepContent}>
      <Text style={styles.stepTitle}>🚚 Datos de Envío</Text>
      <Text style={styles.stepSubtitle}>
        Configura los detalles del envío
      </Text>

      {/* Método de envío */}
      <View style={styles.formGroup}>
        <Text style={styles.inputLabel}>Método de Envío</Text>
        <View style={styles.methodButtons}>
          <TouchableOpacity 
            style={[
              styles.methodButton, 
              metodoEnvio === 'consolidado' && styles.methodButtonActive
            ]}
            onPress={() => setMetodoEnvio('consolidado')}
          >
            <Ionicons 
              name="cube" 
              size={24} 
              color={metodoEnvio === 'consolidado' ? '#fff' : ORANGE} 
            />
            <Text style={[
              styles.methodText,
              metodoEnvio === 'consolidado' && styles.methodTextActive
            ]}>
              Consolidado
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[
              styles.methodButton, 
              metodoEnvio === 'individual' && styles.methodButtonActive
            ]}
            onPress={() => setMetodoEnvio('individual')}
          >
            <Ionicons 
              name="cube-outline" 
              size={24} 
              color={metodoEnvio === 'individual' ? '#fff' : ORANGE} 
            />
            <Text style={[
              styles.methodText,
              metodoEnvio === 'individual' && styles.methodTextActive
            ]}>
              Individual
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Paquetería */}
      <View style={styles.formGroup}>
        <Text style={styles.inputLabel}>Paquetería</Text>
        <TouchableOpacity 
          style={styles.selectButton}
          onPress={() => {
            Alert.alert(
              'Seleccionar Paquetería',
              '',
              paqueterias.map(p => ({
                text: p.nombre,
                onPress: () => setPaqueteria(p.id)
              }))
            );
          }}
        >
          <Text style={[styles.selectButtonText, !paqueteria && styles.selectPlaceholder]}>
            {paqueteria ? paqueterias.find(p => p.id === paqueteria)?.nombre : 'Seleccionar paquetería...'}
          </Text>
          <Ionicons name="chevron-down" size={20} color="#666" />
        </TouchableOpacity>
      </View>

      {/* Guía Master */}
      <View style={styles.formGroup}>
        <Text style={styles.inputLabel}>Guía Master (opcional)</Text>
        <TextInput
          style={styles.input}
          placeholder="Número de guía master..."
          value={guiaMaster}
          onChangeText={setGuiaMaster}
          autoCapitalize="characters"
        />
      </View>

      {/* Destino */}
      <View style={styles.formGroup}>
        <Text style={styles.inputLabel}>Destino</Text>
        <TextInput
          style={styles.input}
          placeholder="Ciudad o sucursal destino..."
          value={destino}
          onChangeText={setDestino}
        />
      </View>

      {/* Observaciones */}
      <View style={styles.formGroup}>
        <Text style={styles.inputLabel}>Observaciones</Text>
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

  const renderStep2 = () => (
    <ScrollView style={styles.stepContent}>
      <Text style={styles.stepTitle}>✅ Confirmar Salida</Text>
      <Text style={styles.stepSubtitle}>
        Revisa el resumen antes de procesar
      </Text>

      {/* Resumen de paquetes */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <Ionicons name="cube" size={32} color={ORANGE} />
          <View>
            <Text style={styles.summaryCount}>{selectedPackages.length}</Text>
            <Text style={styles.summaryLabel}>Paquete(s)</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View>
            <Text style={styles.summaryCount}>{calcularPesoTotal().toFixed(1)}</Text>
            <Text style={styles.summaryLabel}>kg Total</Text>
          </View>
        </View>
      </View>

      {/* Detalles del envío */}
      <View style={styles.detailsCard}>
        <Text style={styles.detailsTitle}>Detalles del Envío</Text>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Método:</Text>
          <Text style={styles.detailValue}>
            {metodoEnvio === 'consolidado' ? 'Consolidado' : 'Individual'}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Paquetería:</Text>
          <Text style={styles.detailValue}>
            {paqueterias.find(p => p.id === paqueteria)?.nombre || '-'}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Guía Master:</Text>
          <Text style={styles.detailValue}>{guiaMaster || 'No asignada'}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Destino:</Text>
          <Text style={styles.detailValue}>{destino || 'No especificado'}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Procesado por:</Text>
          <Text style={styles.detailValue}>{user.full_name || user.name}</Text>
        </View>
      </View>

      {/* Lista de guías */}
      <View style={styles.trackingList}>
        <Text style={styles.trackingListTitle}>Guías incluidas:</Text>
        {selectedPackages.map((pkg, idx) => (
          <Text key={pkg.id} style={styles.trackingItem}>
            {idx + 1}. {pkg.tracking_number}
          </Text>
        ))}
      </View>
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Ionicons name="exit" size={24} color="#fff" />
          <Text style={styles.headerTitle}>Nueva Salida</Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

      {/* Stepper */}
      <View style={styles.stepper}>
        {[0, 1, 2].map((s, idx) => (
          <React.Fragment key={s}>
            <TouchableOpacity 
              style={[styles.stepDot, step >= s && styles.stepDotActive]}
              onPress={() => s <= step && setStep(s)}
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
        <Text style={[styles.stepLabel, step === 0 && styles.stepLabelActive]}>Paquetes</Text>
        <Text style={[styles.stepLabel, step === 1 && styles.stepLabelActive]}>Envío</Text>
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
        {step === 0 && (
          <TouchableOpacity 
            style={[styles.nextButton, selectedPackages.length === 0 && styles.buttonDisabled]}
            onPress={() => setStep(1)}
            disabled={selectedPackages.length === 0}
          >
            <Text style={styles.nextButtonText}>
              Continuar ({selectedPackages.length} paquetes)
            </Text>
            <Ionicons name="arrow-forward" size={24} color="#fff" />
          </TouchableOpacity>
        )}
        {step === 1 && (
          <View style={styles.footerButtons}>
            <TouchableOpacity style={styles.backButton} onPress={() => setStep(0)}>
              <Text style={styles.backButtonText}>Atrás</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.nextButton, { flex: 2 }, !paqueteria && styles.buttonDisabled]}
              onPress={() => setStep(2)}
              disabled={!paqueteria}
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
              onPress={procesarSalida}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.processButtonText}>Procesar Salida</Text>
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
            <Ionicons name="barcode-outline" size={32} color={ORANGE} />
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
    backgroundColor: ORANGE,
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
    backgroundColor: ORANGE,
    borderColor: ORANGE,
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
    backgroundColor: ORANGE,
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
    color: ORANGE,
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
    backgroundColor: ORANGE,
    width: 56,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: ORANGE,
  },
  selectedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  selectedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: BLACK,
  },
  selectedWeight: {
    fontSize: 14,
    fontWeight: '600',
    color: ORANGE,
  },
  packageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  packageIndex: {
    width: 30,
    fontSize: 14,
    fontWeight: '600',
    color: ORANGE,
  },
  packageInfo: {
    flex: 1,
  },
  packageTracking: {
    fontSize: 14,
    fontWeight: '600',
    color: BLACK,
  },
  packageUser: {
    fontSize: 12,
    color: '#666',
  },
  packageWeight: {
    fontSize: 12,
    color: '#999',
  },
  availableSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  availableTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: BLACK,
    marginBottom: 4,
  },
  availableHint: {
    fontSize: 12,
    color: '#999',
    marginBottom: 12,
  },
  availableItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    gap: 12,
  },
  availableInfo: {
    flex: 1,
  },
  availableTracking: {
    fontSize: 14,
    color: BLACK,
  },
  availableUser: {
    fontSize: 12,
    color: '#666',
  },
  availableWeight: {
    fontSize: 13,
    color: '#999',
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
  pickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    overflow: 'hidden',
  },
  picker: {
    height: 50,
  },
  selectButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#ddd',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectButtonText: {
    fontSize: 16,
    color: BLACK,
  },
  selectPlaceholder: {
    color: '#999',
  },
  methodButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  methodButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: ORANGE,
    gap: 8,
  },
  methodButtonActive: {
    backgroundColor: ORANGE,
  },
  methodText: {
    fontSize: 14,
    fontWeight: '600',
    color: ORANGE,
  },
  methodTextActive: {
    color: '#fff',
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  summaryCount: {
    fontSize: 28,
    fontWeight: '700',
    color: BLACK,
    textAlign: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#ddd',
  },
  detailsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  detailsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: BLACK,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: BLACK,
  },
  trackingList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  trackingListTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 10,
  },
  trackingItem: {
    fontSize: 13,
    color: BLACK,
    paddingVertical: 4,
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
    backgroundColor: ORANGE,
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
    backgroundColor: '#4CAF50',
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
    backgroundColor: ORANGE,
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
    backgroundColor: ORANGE,
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
    borderColor: ORANGE,
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
