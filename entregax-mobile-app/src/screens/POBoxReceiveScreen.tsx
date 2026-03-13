/**
 * POBoxReceiveScreen - Wizard de Recibir Paquetería en Serie
 * Permite agregar múltiples cajas con guía, peso y medidas
 */

import React, { useState, useRef, useEffect } from 'react';
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

interface Caja {
  id: string;
  guiaProveedor: string;
  guiaIndividual: string;
  peso: string;
  largo: string;
  ancho: string;
  alto: string;
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

export default function POBoxReceiveScreen({ navigation, route }: Props) {
  const { user, token } = route.params;
  const [step, setStep] = useState(0); // 0: Agregar Cajas, 1: Foto & Cliente
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Campos de la caja actual
  const [guiaProveedor, setGuiaProveedor] = useState('');
  const [guiaIndividual, setGuiaIndividual] = useState('');
  const [peso, setPeso] = useState('');
  const [largo, setLargo] = useState('');
  const [ancho, setAncho] = useState('');
  const [alto, setAlto] = useState('');
  
  // Foto y cliente
  const [foto, setFoto] = useState<string | null>(null);
  const [clienteBoxId, setClienteBoxId] = useState('');
  const [clienteInfo, setClienteInfo] = useState<any>(null);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  
  // Scanner
  const [showScanner, setShowScanner] = useState(false);
  const [scannerReady, setScannerReady] = useState(true);
  const [permission, requestPermission] = useCameraPermissions();
  
  const guiaInputRef = useRef<TextInput>(null);

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
    setGuiaProveedor(scannedCode);
    setShowScanner(false);
    
    // Re-habilitar scanner después de un delay
    setTimeout(() => setScannerReady(true), 1000);
  };

  const generarGuiaIndividual = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `US-${timestamp}${random}`;
  };

  const agregarCaja = () => {
    if (!guiaProveedor.trim()) {
      Alert.alert('Error', 'Ingresa la guía del proveedor');
      return;
    }
    if (!peso || parseFloat(peso) <= 0) {
      Alert.alert('Error', 'Ingresa el peso de la caja');
      return;
    }
    if (!largo || !ancho || !alto) {
      Alert.alert('Error', 'Ingresa las medidas de la caja');
      return;
    }

    const nuevaCaja: Caja = {
      id: Date.now().toString(),
      guiaProveedor: guiaProveedor.trim(),
      guiaIndividual: guiaIndividual || generarGuiaIndividual(),
      peso,
      largo,
      ancho,
      alto,
    };

    setCajas([...cajas, nuevaCaja]);
    
    // Limpiar campos
    setGuiaProveedor('');
    setGuiaIndividual('');
    setPeso('');
    setLargo('');
    setAncho('');
    setAlto('');
    
    // Focus en guía para siguiente caja
    setTimeout(() => guiaInputRef.current?.focus(), 100);
  };

  const eliminarCaja = (id: string) => {
    setCajas(cajas.filter(c => c.id !== id));
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
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      setFoto(result.assets[0].uri);
    }
  };

  const buscarCliente = async () => {
    if (!clienteBoxId.trim()) return;
    
    setBuscandoCliente(true);
    try {
      const response = await fetch(`${API_URL}/api/users/by-box/${clienteBoxId.trim()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setClienteInfo(data.user || data);
      } else {
        setClienteInfo(null);
        Alert.alert('No encontrado', 'No se encontró un cliente con ese Box ID');
      }
    } catch (error) {
      console.error('Error buscando cliente:', error);
      Alert.alert('Error', 'No se pudo buscar el cliente');
    } finally {
      setBuscandoCliente(false);
    }
  };

  const procesarRecepcion = async () => {
    if (cajas.length === 0) {
      Alert.alert('Error', 'Agrega al menos una caja');
      return;
    }
    if (!clienteInfo) {
      Alert.alert('Error', 'Selecciona un cliente');
      return;
    }

    setLoading(true);
    try {
      // Procesar cada caja
      for (const caja of cajas) {
        const payload = {
          user_id: clienteInfo.id,
          box_id: clienteInfo.box_id,
          tracking_number: caja.guiaIndividual,
          carrier_tracking: caja.guiaProveedor,
          weight_kg: parseFloat(caja.peso),
          dimensions: {
            length: parseFloat(caja.largo),
            width: parseFloat(caja.ancho),
            height: parseFloat(caja.alto),
          },
          status: 'in_warehouse_usa',
          warehouse_location: 'usa_pobox',
          photo_url: foto,
        };

        await fetch(`${API_URL}/api/packages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      }

      Alert.alert(
        '✅ Recepción Exitosa',
        `Se registraron ${cajas.length} paquete(s) para ${clienteInfo.full_name || clienteInfo.name}`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.error('Error procesando recepción:', error);
      Alert.alert('Error', 'No se pudo procesar la recepción');
    } finally {
      setLoading(false);
    }
  };

  const renderStep0 = () => (
    <ScrollView style={styles.stepContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.stepTitle}>📦 Agregar Cajas</Text>
      <Text style={styles.stepSubtitle}>
        Pesa y mide cada caja. Puedes agregar las que necesites.
      </Text>

      {/* Formulario de caja */}
      <View style={styles.formCard}>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>📦 Guía del Proveedor (Amazon, UPS, etc.)</Text>
          <View style={styles.inputWithScan}>
            <TextInput
              ref={guiaInputRef}
              style={[styles.input, styles.inputFlex]}
              placeholder="Escanea o escribe la guía..."
              value={guiaProveedor}
              onChangeText={setGuiaProveedor}
              autoCapitalize="characters"
            />
            <TouchableOpacity style={styles.scanButton} onPress={abrirScanner}>
              <Ionicons name="barcode-outline" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Guía individual de esta caja</Text>
          <TextInput
            style={[styles.input, styles.inputDisabled]}
            placeholder="Se genera automáticamente"
            value={guiaIndividual}
            onChangeText={setGuiaIndividual}
          />
        </View>

        <View style={styles.rowInputs}>
          <View style={styles.smallInputGroup}>
            <Text style={styles.inputLabel}>Peso (kg)</Text>
            <TextInput
              style={styles.input}
              placeholder="kg"
              value={peso}
              onChangeText={setPeso}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.smallInputGroup}>
            <Text style={styles.inputLabel}>Largo (cm)</Text>
            <TextInput
              style={styles.input}
              placeholder="cm"
              value={largo}
              onChangeText={setLargo}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.smallInputGroup}>
            <Text style={styles.inputLabel}>Ancho (cm)</Text>
            <TextInput
              style={styles.input}
              placeholder="cm"
              value={ancho}
              onChangeText={setAncho}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.smallInputGroup}>
            <Text style={styles.inputLabel}>Alto (cm)</Text>
            <TextInput
              style={styles.input}
              placeholder="cm"
              value={alto}
              onChangeText={setAlto}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <TouchableOpacity style={styles.addButton} onPress={agregarCaja}>
          <Ionicons name="add-circle" size={24} color="#fff" />
          <Text style={styles.addButtonText}>Agregar Caja</Text>
        </TouchableOpacity>
      </View>

      {/* Lista de cajas agregadas */}
      {cajas.length > 0 && (
        <View style={styles.cajasSection}>
          <Text style={styles.cajasTitle}>
            Cajas agregadas ({cajas.length})
          </Text>
          {cajas.map((caja, index) => (
            <View key={caja.id} style={styles.cajaItem}>
              <View style={styles.cajaInfo}>
                <Text style={styles.cajaIndex}>#{index + 1}</Text>
                <View>
                  <Text style={styles.cajaGuia}>{caja.guiaIndividual}</Text>
                  <Text style={styles.cajaDetalles}>
                    {caja.peso}kg • {caja.largo}x{caja.ancho}x{caja.alto}cm
                  </Text>
                  <Text style={styles.cajaProveedor}>
                    Proveedor: {caja.guiaProveedor}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => eliminarCaja(caja.id)}>
                <Ionicons name="trash-outline" size={24} color="#f44336" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );

  const renderStep1 = () => (
    <ScrollView style={styles.stepContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.stepTitle}>📸 Foto & Cliente</Text>
      <Text style={styles.stepSubtitle}>
        Toma una foto de los paquetes y asigna al cliente
      </Text>

      {/* Foto */}
      <View style={styles.fotoSection}>
        <Text style={styles.inputLabel}>Foto de evidencia</Text>
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
            <Ionicons name="camera" size={48} color={ORANGE} />
            <Text style={styles.fotoButtonText}>Tomar Foto</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Buscar Cliente */}
      <View style={styles.clienteSection}>
        <Text style={styles.inputLabel}>🔍 Buscar Cliente por Box ID</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Ej: S-0001"
            value={clienteBoxId}
            onChangeText={setClienteBoxId}
            autoCapitalize="characters"
            onSubmitEditing={buscarCliente}
          />
          <TouchableOpacity 
            style={styles.searchButton} 
            onPress={buscarCliente}
            disabled={buscandoCliente}
          >
            {buscandoCliente ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons name="search" size={24} color="#fff" />
            )}
          </TouchableOpacity>
        </View>

        {clienteInfo && (
          <View style={styles.clienteCard}>
            <Ionicons name="person-circle" size={48} color={ORANGE} />
            <View style={styles.clienteInfo}>
              <Text style={styles.clienteNombre}>
                {clienteInfo.full_name || clienteInfo.name}
              </Text>
              <Text style={styles.clienteBoxId}>
                Box ID: {clienteInfo.box_id}
              </Text>
              <Text style={styles.clienteEmail}>{clienteInfo.email}</Text>
            </View>
            <Ionicons name="checkmark-circle" size={28} color="#4CAF50" />
          </View>
        )}
      </View>

      {/* Resumen */}
      <View style={styles.resumenSection}>
        <Text style={styles.resumenTitle}>📋 Resumen de Recepción</Text>
        <View style={styles.resumenRow}>
          <Text style={styles.resumenLabel}>Cajas a recibir:</Text>
          <Text style={styles.resumenValue}>{cajas.length}</Text>
        </View>
        <View style={styles.resumenRow}>
          <Text style={styles.resumenLabel}>Peso total:</Text>
          <Text style={styles.resumenValue}>
            {cajas.reduce((sum, c) => sum + parseFloat(c.peso || '0'), 0).toFixed(2)} kg
          </Text>
        </View>
        <View style={styles.resumenRow}>
          <Text style={styles.resumenLabel}>Cliente:</Text>
          <Text style={styles.resumenValue}>
            {clienteInfo ? clienteInfo.full_name || clienteInfo.name : 'No seleccionado'}
          </Text>
        </View>
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
          <Ionicons name="cube" size={24} color="#fff" />
          <Text style={styles.headerTitle}>Recibir Paquetería en Serie</Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

      {/* Ubicación */}
      <View style={styles.locationBar}>
        <Ionicons name="location" size={16} color={ORANGE} />
        <Text style={styles.locationText}>Bodega Hidalgo, TX</Text>
      </View>

      {/* Stepper */}
      <View style={styles.stepper}>
        <TouchableOpacity 
          style={[styles.stepDot, step === 0 && styles.stepDotActive]}
          onPress={() => setStep(0)}
        >
          <Ionicons name="cube" size={20} color={step === 0 ? '#fff' : ORANGE} />
        </TouchableOpacity>
        <View style={styles.stepLine} />
        <TouchableOpacity 
          style={[styles.stepDot, step === 1 && styles.stepDotActive]}
          onPress={() => cajas.length > 0 && setStep(1)}
        >
          <Ionicons name="camera" size={20} color={step === 1 ? '#fff' : ORANGE} />
        </TouchableOpacity>
      </View>
      <View style={styles.stepperLabels}>
        <Text style={[styles.stepLabel, step === 0 && styles.stepLabelActive]}>
          Agregar Cajas
        </Text>
        <Text style={[styles.stepLabel, step === 1 && styles.stepLabelActive]}>
          Foto & Cliente
        </Text>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {step === 0 ? renderStep0() : renderStep1()}
      </KeyboardAvoidingView>

      {/* Footer con botones */}
      <View style={styles.footer}>
        {step === 0 ? (
          <TouchableOpacity 
            style={[styles.nextButton, cajas.length === 0 && styles.buttonDisabled]}
            onPress={() => setStep(1)}
            disabled={cajas.length === 0}
          >
            <Text style={styles.nextButtonText}>Siguiente</Text>
            <Ionicons name="arrow-forward" size={24} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={styles.footerButtons}>
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => setStep(0)}
            >
              <Text style={styles.backButtonText}>Atrás</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.processButton, (!clienteInfo || loading) && styles.buttonDisabled]}
              onPress={procesarRecepcion}
              disabled={!clienteInfo || loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.processButtonText}>Procesar Recepción</Text>
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
  locationBar: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  locationText: {
    color: '#666',
    fontSize: 14,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    backgroundColor: '#fff',
  },
  stepDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    backgroundColor: ORANGE,
  },
  stepLine: {
    width: 80,
    height: 2,
    backgroundColor: ORANGE,
    marginHorizontal: 10,
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
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: ORANGE,
    borderStyle: 'dashed',
  },
  inputGroup: {
    marginBottom: 16,
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
  inputDisabled: {
    backgroundColor: '#f0f0f0',
    color: '#999',
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  smallInputGroup: {
    flex: 1,
  },
  addButton: {
    backgroundColor: ORANGE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cajasSection: {
    marginTop: 20,
  },
  cajasTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: BLACK,
  },
  cajaItem: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cajaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  cajaIndex: {
    backgroundColor: ORANGE,
    color: '#fff',
    width: 32,
    height: 32,
    borderRadius: 16,
    textAlign: 'center',
    lineHeight: 32,
    fontWeight: '700',
    fontSize: 14,
  },
  cajaGuia: {
    fontSize: 14,
    fontWeight: '700',
    color: BLACK,
  },
  cajaDetalles: {
    fontSize: 13,
    color: '#666',
  },
  cajaProveedor: {
    fontSize: 12,
    color: '#999',
  },
  fotoSection: {
    marginBottom: 24,
  },
  fotoButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: ORANGE,
    borderStyle: 'dashed',
    padding: 40,
    alignItems: 'center',
  },
  fotoButtonText: {
    marginTop: 8,
    color: ORANGE,
    fontSize: 16,
    fontWeight: '600',
  },
  fotoPreview: {
    position: 'relative',
  },
  fotoImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  fotoRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  clienteSection: {
    marginBottom: 24,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
  },
  searchButton: {
    backgroundColor: ORANGE,
    width: 50,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clienteCard: {
    backgroundColor: '#e8f5e9',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  clienteInfo: {
    flex: 1,
  },
  clienteNombre: {
    fontSize: 16,
    fontWeight: '700',
    color: BLACK,
  },
  clienteBoxId: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  clienteEmail: {
    fontSize: 13,
    color: '#666',
  },
  resumenSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  resumenTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    color: BLACK,
  },
  resumenRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  resumenLabel: {
    color: '#666',
    fontSize: 14,
  },
  resumenValue: {
    fontWeight: '600',
    color: BLACK,
    fontSize: 14,
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
  inputWithScan: {
    flexDirection: 'row',
    gap: 8,
  },
  inputFlex: {
    flex: 1,
  },
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
