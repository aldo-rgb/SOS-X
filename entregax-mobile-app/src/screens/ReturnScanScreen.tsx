/**
 * ReturnScanScreen - Escaneo de Retorno a Bodega
 * 
 * Funcionalidad:
 * - Lista paquetes que el chofer tiene como "out_for_delivery"
 * - Permite escanear los que NO se entregaron
 * - Selección de motivo de retorno
 * - Devuelve los paquetes al inventario del CEDIS
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Vibration,
  Animated,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import api from '../services/api';

interface PackageToReturn {
  id: number;
  tracking_number: string;
  delivery_address: string;
  delivery_city: string;
  recipient_name: string;
  loaded_at: string;
}

interface ReturnReason {
  value: string;
  label: string;
  icon: string;
}

const RETURN_REASONS: ReturnReason[] = [
  { value: 'client_not_home', label: 'Cliente no estaba', icon: 'person-off' },
  { value: 'wrong_address', label: 'Dirección incorrecta', icon: 'location-off' },
  { value: 'client_refused', label: 'Cliente rechazó', icon: 'do-not-disturb' },
  { value: 'damaged_package', label: 'Paquete dañado', icon: 'broken-image' },
  { value: 'reschedule_requested', label: 'Reprogramación solicitada', icon: 'schedule' },
  { value: 'access_denied', label: 'No se pudo acceder', icon: 'lock' },
  { value: 'other', label: 'Otro motivo', icon: 'help-outline' },
];

interface FeedbackMessage {
  type: 'success' | 'error' | 'warning';
  message: string;
}

export default function ReturnScanScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [packagesToReturn, setPackagesToReturn] = useState<PackageToReturn[]>([]);
  const [returnedCount, setReturnedCount] = useState(0);
  const [totalToReturn, setTotalToReturn] = useState(0);
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scannerActive, setScannerActive] = useState(true);
  const [lastScannedCode, setLastScannedCode] = useState<string>('');
  
  // Modal de selección de motivo
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [pendingBarcode, setPendingBarcode] = useState<string>('');
  const [selectedReason, setSelectedReason] = useState<string>('client_not_home');
  
  const [permission, requestPermission] = useCameraPermissions();
  
  // Animaciones
  const feedbackOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadPackagesToReturn();
  }, []);

  const loadPackagesToReturn = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/driver/packages-to-return');
      if (res.data.success) {
        setPackagesToReturn(res.data.packages);
        setTotalToReturn(res.data.totalToReturn);
      }
    } catch (error) {
      console.error('Error cargando paquetes:', error);
      Alert.alert('Error', 'No se pudieron cargar los paquetes pendientes');
    } finally {
      setLoading(false);
    }
  };

  const showFeedback = (fb: FeedbackMessage) => {
    setFeedback(fb);
    Animated.sequence([
      Animated.timing(feedbackOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(2500),
      Animated.timing(feedbackOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setFeedback(null));
  };

  const handleBarCodeScanned = useCallback(async (result: BarcodeScanningResult) => {
    const { data } = result;
    
    if (!scannerActive || isScanning || data === lastScannedCode) {
      return;
    }

    setIsScanning(true);
    setScannerActive(false);
    setLastScannedCode(data);
    
    // Verificar si el paquete está en la lista
    const packageFound = packagesToReturn.find(
      p => p.tracking_number === data || p.tracking_number.includes(data)
    );
    
    if (!packageFound) {
      Vibration.vibrate([0, 200, 100, 200]);
      showFeedback({
        type: 'error',
        message: '❌ Este paquete no está en tu lista de retornos',
      });
      setTimeout(() => {
        setIsScanning(false);
        setScannerActive(true);
        setLastScannedCode('');
      }, 1500);
      return;
    }

    // Mostrar modal para seleccionar motivo
    setPendingBarcode(data);
    setShowReasonModal(true);
    
  }, [scannerActive, isScanning, lastScannedCode, packagesToReturn]);

  const handleConfirmReturn = async () => {
    setShowReasonModal(false);
    
    try {
      const res = await api.post('/api/driver/scan-return', { 
        barcode: pendingBarcode,
        returnReason: selectedReason 
      });
      
      if (res.data.success) {
        Vibration.vibrate(100);
        setReturnedCount(prev => prev + 1);
        
        // Remover de la lista
        setPackagesToReturn(prev => 
          prev.filter(p => p.tracking_number !== pendingBarcode)
        );
        
        showFeedback({
          type: 'success',
          message: '✅ Paquete devuelto a bodega',
        });
      }
    } catch (error: any) {
      Vibration.vibrate([0, 200, 100, 200, 100, 200]);
      showFeedback({
        type: 'error',
        message: error.response?.data?.error || 'Error al procesar retorno',
      });
    } finally {
      setPendingBarcode('');
      setSelectedReason('client_not_home');
      setTimeout(() => {
        setIsScanning(false);
        setScannerActive(true);
        setLastScannedCode('');
      }, 1000);
    }
  };

  const handleCancelReturn = () => {
    setShowReasonModal(false);
    setPendingBarcode('');
    setSelectedReason('client_not_home');
    setTimeout(() => {
      setIsScanning(false);
      setScannerActive(true);
      setLastScannedCode('');
    }, 500);
  };

  const handleFinishReturns = () => {
    if (packagesToReturn.length > 0) {
      Alert.alert(
        '⚠️ Paquetes Pendientes',
        `Aún tienes ${packagesToReturn.length} paquetes sin devolver. ¿Qué quieres hacer con ellos?`,
        [
          { text: 'Seguir Escaneando', style: 'cancel' },
          { 
            text: 'Reportar Problema', 
            onPress: () => {
              // Navegar a pantalla de reporte
              Alert.alert('📝', 'Contacta a tu supervisor para reportar los paquetes faltantes.');
            }
          },
        ]
      );
    } else {
      Alert.alert(
        '✅ Retorno Completo',
        'Todos los paquetes han sido procesados correctamente.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    }
  };

  const allReturned = packagesToReturn.length === 0 && totalToReturn > 0;

  if (!permission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#F05A28" />
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <MaterialIcons name="camera-alt" size={64} color="#ccc" />
          <Text style={styles.permissionTitle}>Permiso de Cámara Requerido</Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Otorgar Permiso</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#F05A28" />
          <Text style={styles.loadingText}>Cargando paquetes pendientes...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Si no hay paquetes que retornar
  if (totalToReturn === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.title}>Retorno a Bodega</Text>
        </View>
        
        <View style={styles.emptyState}>
          <MaterialIcons name="check-circle" size={80} color="#4CAF50" />
          <Text style={styles.emptyTitle}>¡Excelente! 🎉</Text>
          <Text style={styles.emptySubtitle}>
            No tienes paquetes pendientes de retorno.{'\n'}
            Todos fueron entregados exitosamente.
          </Text>
          <TouchableOpacity 
            style={styles.doneButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.doneButtonText}>Volver al Inicio</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={styles.title}>Retorno a Bodega 📥</Text>
          <Text style={styles.subtitle}>Escanea paquetes no entregados</Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{returnedCount}</Text>
          <Text style={styles.statLabel}>Devueltos</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={[styles.statNumber, { color: '#FF9800' }]}>
            {packagesToReturn.length}
          </Text>
          <Text style={styles.statLabel}>Pendientes</Text>
        </View>
      </View>

      {/* Lista de paquetes pendientes */}
      <View style={styles.listHeader}>
        <MaterialIcons name="inventory" size={20} color="#666" />
        <Text style={styles.listTitle}>
          Paquetes sin Entregar ({packagesToReturn.length})
        </Text>
      </View>
      
      <ScrollView style={styles.listContainer} horizontal>
        {packagesToReturn.map((pkg) => (
          <View key={pkg.id} style={styles.packageCard}>
            <Text style={styles.packageTracking} numberOfLines={1}>
              {pkg.tracking_number}
            </Text>
            <Text style={styles.packageCity}>{pkg.delivery_city}</Text>
            <Text style={styles.packageRecipient} numberOfLines={1}>
              👤 {pkg.recipient_name}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* Scanner */}
      {!allReturned ? (
        <View style={styles.scannerSection}>
          <View style={styles.scannerWrapper}>
            <CameraView
              style={styles.scanner}
              barcodeScannerSettings={{
                barcodeTypes: ['code128', 'code39', 'qr', 'ean13', 'ean8', 'upc_a'],
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
                <Text style={styles.scanningText}>Procesando...</Text>
              </View>
            )}
          </View>
          
          <Text style={styles.helperText}>
            📷 Escanea el código del paquete que no pudiste entregar
          </Text>
        </View>
      ) : (
        <View style={styles.allReturnedSection}>
          <MaterialIcons name="inventory-2" size={60} color="#4CAF50" />
          <Text style={styles.allReturnedTitle}>Todos los Paquetes Procesados</Text>
          <Text style={styles.allReturnedSubtitle}>
            {returnedCount} paquetes devueltos a bodega
          </Text>
        </View>
      )}

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        <TouchableOpacity 
          style={[
            styles.finishButton,
            allReturned && styles.finishButtonSuccess
          ]} 
          onPress={handleFinishReturns}
        >
          <MaterialIcons 
            name={allReturned ? "check-circle" : "assignment-turned-in"} 
            size={24} 
            color="#fff" 
          />
          <Text style={styles.finishButtonText}>
            {allReturned ? 'Finalizar Día' : 'Terminar Retornos'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Feedback Message */}
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

      {/* Modal: Selección de Motivo */}
      <Modal
        visible={showReasonModal}
        transparent
        animationType="slide"
        onRequestClose={handleCancelReturn}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📝 Motivo de Retorno</Text>
              <TouchableOpacity onPress={handleCancelReturn}>
                <MaterialIcons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.modalSubtitle}>
              ¿Por qué no se pudo entregar este paquete?
            </Text>
            
            <ScrollView style={styles.reasonsList}>
              {RETURN_REASONS.map((reason) => (
                <TouchableOpacity
                  key={reason.value}
                  style={[
                    styles.reasonItem,
                    selectedReason === reason.value && styles.reasonItemSelected
                  ]}
                  onPress={() => setSelectedReason(reason.value)}
                >
                  <MaterialIcons 
                    name={reason.icon as any} 
                    size={24} 
                    color={selectedReason === reason.value ? '#F05A28' : '#666'} 
                  />
                  <Text style={[
                    styles.reasonText,
                    selectedReason === reason.value && styles.reasonTextSelected
                  ]}>
                    {reason.label}
                  </Text>
                  {selectedReason === reason.value && (
                    <MaterialIcons name="check-circle" size={20} color="#F05A28" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
            
            <TouchableOpacity 
              style={styles.confirmButton}
              onPress={handleConfirmReturn}
            >
              <MaterialIcons name="send" size={20} color="#fff" />
              <Text style={styles.confirmButtonText}>Confirmar Retorno</Text>
            </TouchableOpacity>
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
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#666',
  },
  
  // Permisos
  permissionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
    color: '#333',
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
    fontSize: 16,
    fontWeight: 'bold',
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
  
  // Stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 15,
    marginTop: 10,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#eee',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  
  // Lista horizontal
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    paddingBottom: 10,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginLeft: 8,
  },
  listContainer: {
    maxHeight: 100,
    paddingHorizontal: 10,
  },
  packageCard: {
    width: 150,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: '#FF9800',
  },
  packageTracking: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  },
  packageCity: {
    fontSize: 11,
    color: '#F05A28',
    marginTop: 4,
  },
  packageRecipient: {
    fontSize: 10,
    color: '#888',
    marginTop: 4,
  },
  
  // Scanner
  scannerSection: {
    flex: 1,
    padding: 15,
  },
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
    borderColor: '#FF9800',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
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
    fontSize: 14,
  },
  helperText: {
    textAlign: 'center',
    marginTop: 15,
    fontSize: 14,
    color: '#666',
  },
  
  // All returned
  allReturnedSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  allReturnedTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginTop: 15,
  },
  allReturnedSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  
  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginTop: 20,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 22,
  },
  doneButton: {
    marginTop: 30,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 8,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  
  // Bottom actions
  bottomActions: {
    padding: 15,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  finishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF9800',
    padding: 15,
    borderRadius: 8,
  },
  finishButtonSuccess: {
    backgroundColor: '#4CAF50',
  },
  finishButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  
  // Feedback
  feedbackBox: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderRadius: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
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
    flex: 1,
  },
  
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalSubtitle: {
    padding: 20,
    paddingBottom: 10,
    fontSize: 14,
    color: '#666',
  },
  reasonsList: {
    maxHeight: 300,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  reasonItemSelected: {
    backgroundColor: '#fff5f2',
  },
  reasonText: {
    flex: 1,
    marginLeft: 15,
    fontSize: 16,
    color: '#333',
  },
  reasonTextSelected: {
    color: '#F05A28',
    fontWeight: '600',
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F05A28',
    margin: 20,
    padding: 15,
    borderRadius: 8,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 10,
  },
});
