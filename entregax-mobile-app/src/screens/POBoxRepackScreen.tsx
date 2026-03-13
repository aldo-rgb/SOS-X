/**
 * POBoxRepackScreen - Wizard de Procesar Reempaque
 * Permite escanear guías y crear un paquete consolidado
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
  Image,
  Modal,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#111111';
const PURPLE = '#9C27B0';

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

export default function POBoxRepackScreen({ navigation, route }: Props) {
  const { user, token } = route.params;
  const [step, setStep] = useState(0); // 0: Escanear Guías, 1: Nuevo Paquete, 2: Confirmar
  const [loading, setLoading] = useState(false);
  
  // Paquetes a consolidar
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [packages, setPackages] = useState<Package[]>([]);
  
  // Nuevo paquete consolidado
  const [nuevaGuia, setNuevaGuia] = useState('');
  const [nuevoPeso, setNuevoPeso] = useState('');
  const [nuevoLargo, setNuevoLargo] = useState('');
  const [nuevoAncho, setNuevoAncho] = useState('');
  const [nuevoAlto, setNuevoAlto] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
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
    
    // Buscar y agregar automáticamente
    setTimeout(() => {
      buscarYAgregar();
      setScannerReady(true);
    }, 500);
  };

  const generarGuiaConsolidada = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 4).toUpperCase();
    return `RP-${timestamp}${random}`;
  };

  const buscarYAgregar = async () => {
    if (!searchQuery.trim()) return;
    
    // Verificar si ya está agregado
    const yaExiste = packages.find(p => 
      p.tracking_number.toLowerCase() === searchQuery.trim().toLowerCase()
    );
    if (yaExiste) {
      Alert.alert('Info', 'Este paquete ya está en la lista');
      setSearchQuery('');
      return;
    }
    
    setSearching(true);
    try {
      const response = await fetch(
        `${API_URL}/api/packages/search?q=${searchQuery.trim()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.ok) {
        const data = await response.json();
        const found = Array.isArray(data) ? data[0] : data.packages?.[0] || data;
        
        if (found && found.id) {
          setPackages([...packages, found]);
          setSearchQuery('');
          setTimeout(() => searchInputRef.current?.focus(), 100);
        } else {
          Alert.alert('No encontrado', 'No se encontró el paquete');
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

  const eliminarPaquete = (id: number) => {
    setPackages(packages.filter(p => p.id !== id));
  };

  const calcularPesoTotal = () => {
    return packages.reduce((sum, p) => sum + (p.weight_kg || 0), 0);
  };

  const tomarFoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Error', 'Se necesita permiso para acceder a la cámara');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      setFoto(result.assets[0].uri);
    }
  };

  const procesarReempaque = async () => {
    if (packages.length < 2) {
      Alert.alert('Error', 'Agrega al menos 2 paquetes para consolidar');
      return;
    }
    if (!nuevoPeso || parseFloat(nuevoPeso) <= 0) {
      Alert.alert('Error', 'Ingresa el peso del nuevo paquete');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        original_packages: packages.map(p => p.id),
        new_tracking: nuevaGuia || generarGuiaConsolidada(),
        new_weight: parseFloat(nuevoPeso),
        new_dimensions: {
          length: parseFloat(nuevoLargo) || 0,
          width: parseFloat(nuevoAncho) || 0,
          height: parseFloat(nuevoAlto) || 0,
        },
        photo_url: foto,
        notes: observaciones,
        processed_by: user.id,
        processed_at: new Date().toISOString(),
      };

      const response = await fetch(`${API_URL}/api/repack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        Alert.alert(
          '✅ Reempaque Procesado',
          `Se consolidaron ${packages.length} paquetes en:\n${payload.new_tracking}`,
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        throw new Error('Error al procesar reempaque');
      }
    } catch (error) {
      console.error('Error procesando reempaque:', error);
      Alert.alert('Error', 'No se pudo procesar el reempaque');
    } finally {
      setLoading(false);
    }
  };

  const renderStep0 = () => (
    <ScrollView style={styles.stepContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.stepTitle}>📦 Escanear Guías</Text>
      <Text style={styles.stepSubtitle}>
        Escanea o busca los paquetes a consolidar
      </Text>

      {/* Buscador */}
      <View style={styles.searchContainer}>
        <TextInput
          ref={searchInputRef}
          style={[styles.searchInput, { flex: 1 }]}
          placeholder="Escanea o escribe la guía..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="characters"
          onSubmitEditing={buscarYAgregar}
        />
        <TouchableOpacity 
          style={styles.scanButton} 
          onPress={abrirScanner}
        >
          <Ionicons name="barcode-outline" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.searchButton} 
          onPress={buscarYAgregar}
          disabled={searching}
        >
          {searching ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Ionicons name="add" size={24} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      {/* Contador */}
      <View style={styles.counterCard}>
        <View style={styles.counterItem}>
          <Text style={styles.counterValue}>{packages.length}</Text>
          <Text style={styles.counterLabel}>Paquetes</Text>
        </View>
        <View style={styles.counterDivider} />
        <View style={styles.counterItem}>
          <Text style={styles.counterValue}>{calcularPesoTotal().toFixed(1)}</Text>
          <Text style={styles.counterLabel}>kg Original</Text>
        </View>
      </View>

      {/* Lista de paquetes */}
      {packages.length > 0 ? (
        <View style={styles.packagesList}>
          <Text style={styles.packagesTitle}>Paquetes a consolidar:</Text>
          {packages.map((pkg, index) => (
            <View key={pkg.id} style={styles.packageItem}>
              <View style={styles.packageNumber}>
                <Text style={styles.packageNumberText}>{index + 1}</Text>
              </View>
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
              <TouchableOpacity onPress={() => eliminarPaquete(pkg.id)}>
                <Ionicons name="close-circle" size={28} color="#f44336" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="cube-outline" size={64} color="#ddd" />
          <Text style={styles.emptyText}>
            Escanea las guías de los paquetes a consolidar
          </Text>
          <Text style={styles.emptyHint}>
            Mínimo 2 paquetes para crear un reempaque
          </Text>
        </View>
      )}
    </ScrollView>
  );

  const renderStep1 = () => (
    <ScrollView style={styles.stepContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.stepTitle}>📦 Nuevo Paquete</Text>
      <Text style={styles.stepSubtitle}>
        Ingresa los datos del paquete consolidado
      </Text>

      {/* Guía del nuevo paquete */}
      <View style={styles.formGroup}>
        <Text style={styles.inputLabel}>Nueva Guía (opcional)</Text>
        <TextInput
          style={styles.input}
          placeholder={generarGuiaConsolidada()}
          value={nuevaGuia}
          onChangeText={setNuevaGuia}
          autoCapitalize="characters"
        />
        <Text style={styles.inputHint}>
          Se genera automáticamente si lo dejas vacío
        </Text>
      </View>

      {/* Peso */}
      <View style={styles.formGroup}>
        <Text style={styles.inputLabel}>Peso del Nuevo Paquete (kg)</Text>
        <View style={styles.inputWithUnit}>
          <TextInput
            style={styles.inputLarge}
            placeholder="0.00"
            value={nuevoPeso}
            onChangeText={setNuevoPeso}
            keyboardType="decimal-pad"
          />
          <Text style={styles.unitLabel}>kg</Text>
        </View>
        <Text style={styles.inputHint}>
          Peso original: {calcularPesoTotal().toFixed(2)} kg
        </Text>
      </View>

      {/* Medidas */}
      <View style={styles.formGroup}>
        <Text style={styles.inputLabel}>Medidas del Nuevo Paquete (cm)</Text>
        <View style={styles.dimensionsRow}>
          <TextInput
            style={styles.dimensionInput}
            placeholder="Largo"
            value={nuevoLargo}
            onChangeText={setNuevoLargo}
            keyboardType="decimal-pad"
          />
          <Text style={styles.dimensionX}>×</Text>
          <TextInput
            style={styles.dimensionInput}
            placeholder="Ancho"
            value={nuevoAncho}
            onChangeText={setNuevoAncho}
            keyboardType="decimal-pad"
          />
          <Text style={styles.dimensionX}>×</Text>
          <TextInput
            style={styles.dimensionInput}
            placeholder="Alto"
            value={nuevoAlto}
            onChangeText={setNuevoAlto}
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      {/* Foto */}
      <View style={styles.formGroup}>
        <Text style={styles.inputLabel}>Foto del Nuevo Paquete</Text>
        {foto ? (
          <View style={styles.fotoPreview}>
            <Image source={{ uri: foto }} style={styles.fotoImage} />
            <TouchableOpacity 
              style={styles.fotoRemove} 
              onPress={() => setFoto(null)}
            >
              <Ionicons name="close-circle" size={30} color="#f44336" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.fotoButton} onPress={tomarFoto}>
            <Ionicons name="camera" size={32} color={PURPLE} />
            <Text style={styles.fotoButtonText}>Tomar Foto</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );

  const renderStep2 = () => (
    <ScrollView style={styles.stepContent}>
      <Text style={styles.stepTitle}>✅ Confirmar Reempaque</Text>
      <Text style={styles.stepSubtitle}>
        Revisa los datos antes de procesar
      </Text>

      {/* Visual */}
      <View style={styles.visualRepack}>
        <View style={styles.visualOriginal}>
          {packages.slice(0, 3).map((_, i) => (
            <View key={i} style={styles.miniBox} />
          ))}
          {packages.length > 3 && (
            <Text style={styles.moreBoxes}>+{packages.length - 3}</Text>
          )}
        </View>
        <Ionicons name="arrow-forward" size={32} color={PURPLE} />
        <View style={styles.visualNew}>
          <Ionicons name="cube" size={48} color={PURPLE} />
        </View>
      </View>

      {/* Resumen */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Resumen del Reempaque</Text>
        
        <View style={styles.summarySection}>
          <Text style={styles.summarySectionTitle}>Paquetes Originales</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Cantidad:</Text>
            <Text style={styles.summaryValue}>{packages.length} paquetes</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Peso original:</Text>
            <Text style={styles.summaryValue}>{calcularPesoTotal().toFixed(2)} kg</Text>
          </View>
        </View>

        <View style={styles.summarySection}>
          <Text style={styles.summarySectionTitle}>Nuevo Paquete</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Guía:</Text>
            <Text style={styles.summaryValue}>
              {nuevaGuia || generarGuiaConsolidada()}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Peso:</Text>
            <Text style={styles.summaryValue}>{nuevoPeso} kg</Text>
          </View>
          {nuevoLargo && nuevoAncho && nuevoAlto && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Medidas:</Text>
              <Text style={styles.summaryValue}>
                {nuevoLargo}x{nuevoAncho}x{nuevoAlto} cm
              </Text>
            </View>
          )}
        </View>

        <View style={styles.summarySection}>
          <Text style={styles.summarySectionTitle}>Procesado por</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Usuario:</Text>
            <Text style={styles.summaryValue}>{user.full_name || user.name}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Fecha:</Text>
            <Text style={styles.summaryValue}>{new Date().toLocaleString()}</Text>
          </View>
        </View>
      </View>

      {/* Guías contenidas */}
      <View style={styles.containedGuias}>
        <Text style={styles.containedTitle}>Guías contenidas:</Text>
        {packages.map((pkg, i) => (
          <Text key={pkg.id} style={styles.containedGuia}>
            {i + 1}. {pkg.tracking_number}
          </Text>
        ))}
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Ionicons name="git-merge" size={24} color="#fff" />
          <Text style={styles.headerTitle}>Procesar Reempaque</Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

      {/* Stepper */}
      <View style={styles.stepper}>
        {[0, 1, 2].map((s, idx) => (
          <React.Fragment key={s}>
            <TouchableOpacity 
              style={[styles.stepDot, step >= s && styles.stepDotActive]}
              onPress={() => s < step && setStep(s)}
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
        <Text style={[styles.stepLabel, step === 0 && styles.stepLabelActive]}>Escanear</Text>
        <Text style={[styles.stepLabel, step === 1 && styles.stepLabelActive]}>Nuevo Paquete</Text>
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
            style={[styles.nextButton, packages.length < 2 && styles.buttonDisabled]}
            onPress={() => setStep(1)}
            disabled={packages.length < 2}
          >
            <Text style={styles.nextButtonText}>
              Continuar ({packages.length} paquetes)
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
              style={[styles.nextButton, { flex: 2 }, (!nuevoPeso || parseFloat(nuevoPeso) <= 0) && styles.buttonDisabled]}
              onPress={() => setStep(2)}
              disabled={!nuevoPeso || parseFloat(nuevoPeso) <= 0}
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
              onPress={procesarReempaque}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.processButtonText}>Procesar Reempaque</Text>
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
            <Ionicons name="barcode-outline" size={32} color={PURPLE} />
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
    backgroundColor: PURPLE,
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
    backgroundColor: PURPLE,
    borderColor: PURPLE,
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
    backgroundColor: PURPLE,
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
    color: PURPLE,
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
    marginBottom: 16,
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
    backgroundColor: PURPLE,
    width: 56,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  counterItem: {
    flex: 1,
    alignItems: 'center',
  },
  counterValue: {
    fontSize: 32,
    fontWeight: '700',
    color: PURPLE,
  },
  counterLabel: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  counterDivider: {
    width: 1,
    height: 50,
    backgroundColor: '#eee',
    marginHorizontal: 20,
  },
  packagesList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  packagesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  packageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  packageNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  packageNumberText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
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
    marginTop: 2,
  },
  packageWeight: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13,
    color: '#ccc',
    marginTop: 8,
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
  inputHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  inputWithUnit: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 16,
  },
  inputLarge: {
    flex: 1,
    fontSize: 24,
    fontWeight: '600',
    paddingVertical: 14,
    textAlign: 'center',
    color: BLACK,
  },
  unitLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
    marginLeft: 8,
  },
  dimensionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dimensionInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    textAlign: 'center',
  },
  dimensionX: {
    fontSize: 18,
    color: '#999',
    fontWeight: '600',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  fotoButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: PURPLE,
    borderStyle: 'dashed',
    padding: 30,
    alignItems: 'center',
  },
  fotoButtonText: {
    marginTop: 8,
    color: PURPLE,
    fontSize: 14,
    fontWeight: '600',
  },
  fotoPreview: {
    position: 'relative',
  },
  fotoImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
  },
  fotoRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  visualRepack: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 30,
    marginBottom: 20,
    gap: 20,
  },
  visualOriginal: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 80,
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniBox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#e0e0e0',
  },
  moreBoxes: {
    fontSize: 12,
    color: '#999',
  },
  visualNew: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#f3e5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: BLACK,
    marginBottom: 16,
  },
  summarySection: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  summarySectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: PURPLE,
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '500',
    color: BLACK,
  },
  containedGuias: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  containedTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  containedGuia: {
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
    backgroundColor: PURPLE,
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
    backgroundColor: PURPLE,
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
    backgroundColor: PURPLE,
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
    borderColor: PURPLE,
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
