/**
 * POBoxEntryScreen - Wizard de Entrada de Paquetes
 * Procesa la entrada de un envío consolidado o individual
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
  FlatList,
  Modal,
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
  carrier_tracking?: string;
  weight_kg?: number;
  status: string;
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

export default function POBoxEntryScreen({ navigation, route }: Props) {
  const { user, token } = route.params;
  const [step, setStep] = useState(0); // 0: Buscar Envío, 1: Verificar Contenido, 2: Confirmar Entrada
  const [loading, setLoading] = useState(false);
  
  // Búsqueda
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'tracking' | 'consolidation' | 'master'>('tracking');
  const [searchResults, setSearchResults] = useState<Package[]>([]);
  const [searching, setSearching] = useState(false);
  
  // Paquetes seleccionados
  const [selectedPackages, setSelectedPackages] = useState<Package[]>([]);
  const [ubicacion, setUbicacion] = useState('');
  
  // Observaciones
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
    
    // Buscar automáticamente
    setTimeout(() => {
      buscarEnvio();
      setScannerReady(true);
    }, 500);
  };

  const buscarEnvio = async () => {
    if (!searchQuery.trim()) return;
    
    setSearching(true);
    setSearchResults([]);
    
    try {
      const endpoint = searchType === 'consolidation' 
        ? `${API_URL}/api/consolidations/${searchQuery.trim()}/packages`
        : searchType === 'master'
        ? `${API_URL}/api/packages/by-master/${searchQuery.trim()}`
        : `${API_URL}/api/packages/search?q=${searchQuery.trim()}`;
        
      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        const packages = Array.isArray(data) ? data : data.packages || [data];
        setSearchResults(packages);
        
        if (packages.length === 0) {
          Alert.alert('Sin resultados', 'No se encontraron paquetes con esa referencia');
        }
      } else {
        Alert.alert('Error', 'No se encontró el envío');
      }
    } catch (error) {
      console.error('Error buscando envío:', error);
      Alert.alert('Error', 'No se pudo realizar la búsqueda');
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

  const selectAll = () => {
    setSelectedPackages([...searchResults]);
  };

  const deselectAll = () => {
    setSelectedPackages([]);
  };

  const procesarEntrada = async () => {
    if (selectedPackages.length === 0) {
      Alert.alert('Error', 'Selecciona al menos un paquete');
      return;
    }

    setLoading(true);
    try {
      const updates = selectedPackages.map(pkg => ({
        id: pkg.id,
        status: 'in_warehouse_usa',
        warehouse_location: ubicacion || 'usa_pobox',
        entry_notes: observaciones,
        entry_date: new Date().toISOString(),
        entry_by: user.id,
      }));

      const response = await fetch(`${API_URL}/api/packages/bulk-update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ packages: updates }),
      });

      if (response.ok) {
        Alert.alert(
          '✅ Entrada Procesada',
          `Se registró la entrada de ${selectedPackages.length} paquete(s)`,
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        throw new Error('Error al procesar entrada');
      }
    } catch (error) {
      console.error('Error procesando entrada:', error);
      Alert.alert('Error', 'No se pudo procesar la entrada');
    } finally {
      setLoading(false);
    }
  };

  const renderStep0 = () => (
    <ScrollView style={styles.stepContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.stepTitle}>🔍 Buscar Envío</Text>
      <Text style={styles.stepSubtitle}>
        Busca por número de guía, consolidación o guía master
      </Text>

      {/* Tipo de búsqueda */}
      <View style={styles.searchTypeContainer}>
        <TouchableOpacity 
          style={[styles.searchTypeButton, searchType === 'tracking' && styles.searchTypeActive]}
          onPress={() => setSearchType('tracking')}
        >
          <Ionicons name="barcode" size={20} color={searchType === 'tracking' ? '#fff' : ORANGE} />
          <Text style={[styles.searchTypeText, searchType === 'tracking' && styles.searchTypeTextActive]}>
            Guía
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.searchTypeButton, searchType === 'consolidation' && styles.searchTypeActive]}
          onPress={() => setSearchType('consolidation')}
        >
          <Ionicons name="cube" size={20} color={searchType === 'consolidation' ? '#fff' : ORANGE} />
          <Text style={[styles.searchTypeText, searchType === 'consolidation' && styles.searchTypeTextActive]}>
            Consolidación
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.searchTypeButton, searchType === 'master' && styles.searchTypeActive]}
          onPress={() => setSearchType('master')}
        >
          <Ionicons name="git-merge" size={20} color={searchType === 'master' ? '#fff' : ORANGE} />
          <Text style={[styles.searchTypeText, searchType === 'master' && styles.searchTypeTextActive]}>
            Master
          </Text>
        </TouchableOpacity>
      </View>

      {/* Campo de búsqueda */}
      <View style={styles.searchInputContainer}>
        <TextInput
          style={[styles.searchInput, { flex: 1 }]}
          placeholder={
            searchType === 'tracking' ? 'Escanea o escribe la guía...' :
            searchType === 'consolidation' ? 'ID de consolidación (ej: C-0001)' :
            'Número de guía master'
          }
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="characters"
          onSubmitEditing={buscarEnvio}
        />
        <TouchableOpacity 
          style={styles.scanButton} 
          onPress={abrirScanner}
        >
          <Ionicons name="barcode-outline" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.searchButton} 
          onPress={buscarEnvio}
          disabled={searching}
        >
          {searching ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Ionicons name="search" size={24} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      {/* Resultados */}
      {searchResults.length > 0 && (
        <View style={styles.resultsContainer}>
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsTitle}>
              Encontrados: {searchResults.length} paquete(s)
            </Text>
            <View style={styles.selectAllButtons}>
              <TouchableOpacity onPress={selectAll}>
                <Text style={styles.selectAllText}>Seleccionar todos</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={deselectAll}>
                <Text style={styles.deselectAllText}>Limpiar</Text>
              </TouchableOpacity>
            </View>
          </View>

          {searchResults.map(pkg => {
            const isSelected = selectedPackages.find(p => p.id === pkg.id);
            return (
              <TouchableOpacity 
                key={pkg.id}
                style={[styles.packageItem, isSelected && styles.packageItemSelected]}
                onPress={() => togglePackageSelection(pkg)}
              >
                <View style={styles.checkboxContainer}>
                  <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                    {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
                  </View>
                </View>
                <View style={styles.packageInfo}>
                  <Text style={styles.packageTracking}>{pkg.tracking_number}</Text>
                  {pkg.carrier_tracking && (
                    <Text style={styles.packageCarrier}>Proveedor: {pkg.carrier_tracking}</Text>
                  )}
                  {pkg.user && (
                    <Text style={styles.packageUser}>
                      Cliente: {pkg.user.full_name} ({pkg.user.box_id})
                    </Text>
                  )}
                  <Text style={styles.packageStatus}>
                    {pkg.weight_kg ? `${pkg.weight_kg} kg` : 'Sin peso'} • {pkg.status}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );

  const renderStep1 = () => (
    <ScrollView style={styles.stepContent}>
      <Text style={styles.stepTitle}>📦 Verificar Contenido</Text>
      <Text style={styles.stepSubtitle}>
        Revisa los paquetes seleccionados antes de procesar
      </Text>

      <View style={styles.selectedSummary}>
        <Ionicons name="cube" size={48} color={ORANGE} />
        <Text style={styles.selectedCount}>{selectedPackages.length}</Text>
        <Text style={styles.selectedLabel}>Paquete(s) seleccionado(s)</Text>
      </View>

      <View style={styles.selectedList}>
        {selectedPackages.map((pkg, index) => (
          <View key={pkg.id} style={styles.selectedItem}>
            <Text style={styles.selectedIndex}>#{index + 1}</Text>
            <View style={styles.selectedInfo}>
              <Text style={styles.selectedTracking}>{pkg.tracking_number}</Text>
              {pkg.user && (
                <Text style={styles.selectedUser}>
                  {pkg.user.full_name} ({pkg.user.box_id})
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => togglePackageSelection(pkg)}>
              <Ionicons name="close-circle" size={24} color="#f44336" />
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {/* Ubicación */}
      <View style={styles.ubicacionSection}>
        <Text style={styles.inputLabel}>📍 Ubicación en Bodega</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: Estante A-1, Rack 3..."
          value={ubicacion}
          onChangeText={setUbicacion}
        />
      </View>
    </ScrollView>
  );

  const renderStep2 = () => (
    <ScrollView style={styles.stepContent}>
      <Text style={styles.stepTitle}>✅ Confirmar Entrada</Text>
      <Text style={styles.stepSubtitle}>
        Revisa el resumen y confirma la entrada
      </Text>

      <View style={styles.confirmCard}>
        <View style={styles.confirmRow}>
          <Text style={styles.confirmLabel}>Paquetes a ingresar:</Text>
          <Text style={styles.confirmValue}>{selectedPackages.length}</Text>
        </View>
        <View style={styles.confirmRow}>
          <Text style={styles.confirmLabel}>Ubicación:</Text>
          <Text style={styles.confirmValue}>{ubicacion || 'No especificada'}</Text>
        </View>
        <View style={styles.confirmRow}>
          <Text style={styles.confirmLabel}>Registrado por:</Text>
          <Text style={styles.confirmValue}>{user.full_name || user.name}</Text>
        </View>
        <View style={styles.confirmRow}>
          <Text style={styles.confirmLabel}>Fecha/Hora:</Text>
          <Text style={styles.confirmValue}>{new Date().toLocaleString()}</Text>
        </View>
      </View>

      <View style={styles.observacionesSection}>
        <Text style={styles.inputLabel}>📝 Observaciones (opcional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Notas adicionales sobre la entrada..."
          value={observaciones}
          onChangeText={setObservaciones}
          multiline
          numberOfLines={4}
        />
      </View>
    </ScrollView>
  );

  const getCurrentStepValid = () => {
    switch (step) {
      case 0: return selectedPackages.length > 0;
      case 1: return selectedPackages.length > 0;
      case 2: return selectedPackages.length > 0;
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
          <Ionicons name="enter" size={24} color="#fff" />
          <Text style={styles.headerTitle}>Entrada de Paquetes</Text>
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
                if (s < step || (s === step + 1 && getCurrentStepValid())) {
                  setStep(s);
                }
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
        <Text style={[styles.stepLabel, step === 1 && styles.stepLabelActive]}>Verificar</Text>
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
            style={[styles.nextButton, !getCurrentStepValid() && styles.buttonDisabled]}
            onPress={() => setStep(1)}
            disabled={!getCurrentStepValid()}
          >
            <Text style={styles.nextButtonText}>
              Continuar ({selectedPackages.length} seleccionados)
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
              style={[styles.nextButton, { flex: 2 }]}
              onPress={() => setStep(2)}
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
              onPress={procesarEntrada}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.processButtonText}>Procesar Entrada</Text>
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
  searchTypeContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  searchTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ORANGE,
    gap: 6,
  },
  searchTypeActive: {
    backgroundColor: ORANGE,
  },
  searchTypeText: {
    fontSize: 13,
    fontWeight: '600',
    color: ORANGE,
  },
  searchTypeTextActive: {
    color: '#fff',
  },
  searchInputContainer: {
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
  resultsContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: BLACK,
  },
  selectAllButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  selectAllText: {
    color: ORANGE,
    fontSize: 13,
    fontWeight: '600',
  },
  deselectAllText: {
    color: '#999',
    fontSize: 13,
  },
  packageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  packageItemSelected: {
    backgroundColor: '#fff3e0',
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  checkboxContainer: {
    marginRight: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  packageInfo: {
    flex: 1,
  },
  packageTracking: {
    fontSize: 15,
    fontWeight: '600',
    color: BLACK,
  },
  packageCarrier: {
    fontSize: 13,
    color: '#666',
  },
  packageUser: {
    fontSize: 13,
    color: ORANGE,
  },
  packageStatus: {
    fontSize: 12,
    color: '#999',
  },
  selectedSummary: {
    alignItems: 'center',
    paddingVertical: 30,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 20,
  },
  selectedCount: {
    fontSize: 48,
    fontWeight: '700',
    color: ORANGE,
    marginTop: 10,
  },
  selectedLabel: {
    fontSize: 16,
    color: '#666',
  },
  selectedList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  selectedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  selectedIndex: {
    width: 30,
    fontSize: 14,
    fontWeight: '600',
    color: ORANGE,
  },
  selectedInfo: {
    flex: 1,
  },
  selectedTracking: {
    fontSize: 14,
    fontWeight: '600',
    color: BLACK,
  },
  selectedUser: {
    fontSize: 12,
    color: '#666',
  },
  ubicacionSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  confirmCard: {
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
    fontWeight: '600',
    color: BLACK,
  },
  observacionesSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
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
