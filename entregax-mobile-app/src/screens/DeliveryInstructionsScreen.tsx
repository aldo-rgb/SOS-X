// ============================================
// DELIVERY INSTRUCTIONS SCREEN
// Pantalla para asignar instrucciones de entrega a paquetes marítimos
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Modal,
  Dimensions,
} from 'react-native';
import {
  Appbar,
  Card,
  ActivityIndicator,
  RadioButton,
  Button,
  Divider,
  Chip,
  TextInput,
} from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { API_URL, Package } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#111111';
const SEA_COLOR = '#0097A7';

type RootStackParamList = {
  Home: { user: any; token: string };
  DeliveryInstructions: { package: Package; packages?: Package[]; user: any; token: string };
  MyAddresses: { user: any; token: string };
};

type Props = NativeStackScreenProps<RootStackParamList, 'DeliveryInstructions'>;

interface Address {
  id: number;
  alias: string;
  recipient_name?: string;
  street: string;
  exterior_number: string;
  interior_number?: string;
  neighborhood?: string;
  city: string;
  state: string;
  zip_code: string;
  phone?: string;
  is_default: boolean;
}

export default function DeliveryInstructionsScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { package: pkg, packages: multiplePackages, user, token } = route.params;
  
  // Usar múltiples paquetes si vienen, si no usar el paquete único
  const allPackages = multiplePackages && multiplePackages.length > 0 ? multiplePackages : [pkg];
  const isMultiple = allPackages.length > 1;
  
  // Determinar tipo de envío para mostrar ícono correcto
  const shipmentType = (pkg as any).shipment_type;
  const getShipmentIcon = (): 'boat' | 'airplane' | 'car' => {
    if (shipmentType === 'maritime') return 'boat';
    if (shipmentType === 'china_air') return 'airplane';
    if (shipmentType === 'dhl') return 'car';
    return 'boat'; // default
  };
  const shipmentIcon = getShipmentIcon();
  
  // Verificar si ya tiene instrucciones asignadas (modo edición)
  const hasExistingInstructions = !!(pkg as any).delivery_address_id;
  
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(
    hasExistingInstructions ? (pkg as any).delivery_address_id : null
  );
  const [additionalNotes, setAdditionalNotes] = useState(
    hasExistingInstructions ? ((pkg as any).delivery_instructions || '') : ''
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);
  const [containerEta, setContainerEta] = useState<string | null>(null);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  // Obtener direcciones del usuario
  const fetchAddresses = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/addresses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        const addrs = data.addresses || data || [];
        setAddresses(addrs);
        // Si no hay dirección seleccionada (nueva asignación), seleccionar la default
        if (!selectedAddressId) {
          const defaultAddr = addrs.find((a: Address) => a.is_default);
          if (defaultAddr) {
            setSelectedAddressId(defaultAddr.id);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching addresses:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  // Calcular costo estimado basado en el volumen total
  const calculateCost = useCallback(async () => {
    try {
      // Sumar volumen y peso de todos los paquetes
      const totalVolume = allPackages.reduce((sum, p) => sum + ((p as any).volume || 0), 0);
      const totalWeight = allPackages.reduce((sum, p) => sum + (p.weight || 0), 0);
      
      const response = await fetch(`${API_URL}/api/maritime/calculate-cost`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ volume: totalVolume, weight: totalWeight })
      });
      
      if (response.ok) {
        const data = await response.json();
        setEstimatedCost(data.estimatedCost);
      }
    } catch (error) {
      console.error('Error calculating cost:', error);
    }
  }, [allPackages, token]);

  useEffect(() => {
    fetchAddresses();
    calculateCost();
    
    // Obtener ETA del contenedor si existe (usar el primero)
    const firstPackageWithEta = allPackages.find(p => (p as any).container_eta);
    if (firstPackageWithEta) {
      setContainerEta((firstPackageWithEta as any).container_eta);
    }
  }, [fetchAddresses, calculateCost, allPackages]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAddresses();
  };

  // Guardar instrucciones de entrega para todos los paquetes
  const handleSave = async () => {
    if (!selectedAddressId) {
      Alert.alert('Error', 'Por favor selecciona una dirección de entrega');
      return;
    }

    setSaving(true);
    let successCount = 0;
    let errors: string[] = [];
    
    try {
      // Guardar instrucciones para cada paquete
      for (const currentPkg of allPackages) {
        try {
          // El ID del paquete marítimo tiene un offset de 100000
          const realPackageId = currentPkg.id >= 100000 ? currentPkg.id - 100000 : currentPkg.id;
          
          const response = await fetch(`${API_URL}/api/maritime-api/orders/${realPackageId}/delivery-instructions`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              deliveryAddressId: selectedAddressId,
              deliveryInstructions: additionalNotes,
            }),
          });

          if (response.ok) {
            successCount++;
          } else {
            const errorData = await response.json();
            errors.push(`${currentPkg.tracking_internal}: ${errorData.error || 'Error'}`);
          }
        } catch (err) {
          errors.push(`${currentPkg.tracking_internal}: Error de conexión`);
        }
      }

      // Mostrar resultado
      if (successCount > 0) {
        setSavedCount(successCount);
        setSuccessModalVisible(true);
      } else {
        Alert.alert('Error', errors.join('\n'));
      }
    } catch (error) {
      console.error('Error saving instructions:', error);
      Alert.alert('Error', 'Error de conexión. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={SEA_COLOR} />
        <Text style={styles.loadingText}>Cargando...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction onPress={() => navigation.goBack()} color="white" />
        <Appbar.Content 
          title={hasExistingInstructions ? "Modificar Instrucciones" : "Instrucciones de Entrega"} 
          titleStyle={styles.headerTitle}
        />
      </Appbar.Header>

      <ScrollView 
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[SEA_COLOR]} />
        }
      >
        {/* Resumen de paquetes seleccionados */}
        <Card style={styles.packageCard}>
          <Card.Content>
            {/* Header con contador */}
            <View style={styles.packageSummaryHeader}>
              <View style={styles.packageCountBadge}>
                <Ionicons name={shipmentIcon} size={20} color="white" />
                <Text style={styles.packageCountText}>{allPackages.length}</Text>
              </View>
              <Text style={styles.packageSummaryTitle}>
                {isMultiple ? 'Paquetes Seleccionados' : 'Paquete Seleccionado'}
              </Text>
            </View>
            
            {/* Lista de paquetes */}
            <View style={styles.packageList}>
              {allPackages.map((currentPkg, index) => (
                <View key={currentPkg.id} style={styles.packageListItem}>
                  <View style={styles.packageListItemNumber}>
                    <Text style={styles.packageListItemNumberText}>{index + 1}</Text>
                  </View>
                  <View style={styles.packageListItemInfo}>
                    <Text style={styles.packageListTracking}>{currentPkg.tracking_internal}</Text>
                    <Text style={styles.packageListDescription} numberOfLines={1}>
                      {currentPkg.description || 'Sin descripción'}
                    </Text>
                  </View>
                  <View style={styles.packageListItemStats}>
                    <Text style={styles.packageListStatText}>{currentPkg.weight || 0} kg</Text>
                    <Text style={styles.packageListStatText}>{((currentPkg as any).volume || 0).toFixed(2)} m³</Text>
                  </View>
                </View>
              ))}
            </View>
            
            <Divider style={styles.divider} />
            
            {/* Totales */}
            <View style={styles.packageStats}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Peso Total</Text>
                <Text style={styles.statValue}>
                  {allPackages.reduce((sum, p) => sum + (p.weight || 0), 0).toFixed(0)} kg
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Volumen Total</Text>
                <Text style={styles.statValue}>
                  {allPackages.reduce((sum, p) => sum + ((p as any).volume || 0), 0).toFixed(2)} m³
                </Text>
              </View>
              {estimatedCost && (
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Costo Est.</Text>
                  <Text style={[styles.statValue, styles.costValue]}>
                    {formatCurrency(estimatedCost)}
                  </Text>
                </View>
              )}
            </View>

            {containerEta && (
              <View style={styles.etaContainer}>
                <Ionicons name="calendar-outline" size={16} color={SEA_COLOR} />
                <Text style={styles.etaText}>
                  ETA: {formatDate(containerEta)}
                </Text>
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Selección de dirección */}
        <Card style={styles.addressCard}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>📍 Dirección de Entrega</Text>
              <TouchableOpacity 
                onPress={() => navigation.navigate('MyAddresses', { user, token })}
                style={styles.addAddressButton}
              >
                <Ionicons name="add-circle" size={20} color={ORANGE} />
                <Text style={styles.addAddressText}>Agregar</Text>
              </TouchableOpacity>
            </View>

            {addresses.length === 0 ? (
              <View style={styles.noAddresses}>
                <Ionicons name="location-outline" size={48} color="#ccc" />
                <Text style={styles.noAddressesText}>
                  No tienes direcciones guardadas
                </Text>
                <Button
                  mode="contained"
                  onPress={() => navigation.navigate('MyAddresses', { user, token })}
                  style={styles.addFirstButton}
                  buttonColor={SEA_COLOR}
                >
                  Agregar Dirección
                </Button>
              </View>
            ) : (
              <RadioButton.Group
                onValueChange={(value) => setSelectedAddressId(parseInt(value))}
                value={selectedAddressId?.toString() || ''}
              >
                {addresses.map((address) => (
                  <TouchableOpacity
                    key={address.id}
                    style={[
                      styles.addressItem,
                      selectedAddressId === address.id && styles.addressItemSelected
                    ]}
                    onPress={() => setSelectedAddressId(address.id)}
                  >
                    <RadioButton value={address.id.toString()} color={SEA_COLOR} />
                    <View style={styles.addressContent}>
                      <View style={styles.addressHeader}>
                        <Text style={styles.addressAlias}>{address.alias}</Text>
                        {address.is_default && (
                          <View style={styles.principalBadge}>
                            <Text style={styles.principalBadgeText}>Principal</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.addressText}>
                        {address.street} {address.exterior_number}
                        {address.interior_number ? ` Int. ${address.interior_number}` : ''}
                      </Text>
                      <Text style={styles.addressText}>
                        {address.neighborhood}, {address.city}
                      </Text>
                      <Text style={styles.addressText}>
                        {address.state}, C.P. {address.zip_code}
                      </Text>
                      {address.phone && (
                        <Text style={styles.addressPhone}>📞 {address.phone}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </RadioButton.Group>
            )}
          </Card.Content>
        </Card>

        {/* Notas adicionales */}
        <Card style={styles.notesCard}>
          <Card.Content>
            <Text style={styles.sectionTitle}>📝 Notas Adicionales</Text>
            <TextInput
              mode="outlined"
              placeholder="Ej: Dejar en recepción, llamar antes de entregar..."
              value={additionalNotes}
              onChangeText={setAdditionalNotes}
              multiline
              numberOfLines={3}
              style={styles.notesInput}
              outlineColor="#ddd"
              activeOutlineColor={SEA_COLOR}
            />
          </Card.Content>
        </Card>

        {/* Botón guardar */}
        <Button
          mode="contained"
          onPress={handleSave}
          loading={saving}
          disabled={saving || !selectedAddressId}
          style={styles.saveButton}
          buttonColor={SEA_COLOR}
          contentStyle={styles.saveButtonContent}
          labelStyle={styles.saveButtonLabel}
        >
          {saving 
            ? 'Guardando...' 
            : hasExistingInstructions
              ? `✏️ Actualizar Instrucciones${isMultiple ? ` (${allPackages.length})` : ''}`
              : `✅ Guardar Instrucciones${isMultiple ? ` (${allPackages.length})` : ''}`
          }
        </Button>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Modal de Éxito Mejorado */}
      <Modal
        visible={successModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setSuccessModalVisible(false);
          navigation.goBack();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.successModal}>
            {/* Icono animado */}
            <View style={styles.successIconContainer}>
              <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
            </View>
            
            {/* Título */}
            <Text style={styles.successTitle}>¡Instrucciones Guardadas!</Text>
            
            {/* Descripción */}
            <Text style={styles.successMessage}>
              {savedCount === 1 
                ? 'Se asignaron las instrucciones de entrega correctamente.'
                : `Se asignaron instrucciones de entrega a ${savedCount} paquetes correctamente.`}
            </Text>
            
            {/* Resumen visual */}
            <View style={styles.successSummary}>
              <View style={styles.successSummaryItem}>
                <Ionicons name={shipmentIcon} size={24} color={SEA_COLOR} />
                <Text style={styles.successSummaryText}>{savedCount} paquete{savedCount > 1 ? 's' : ''}</Text>
              </View>
              <View style={styles.successSummaryItem}>
                <Ionicons name="location" size={24} color={ORANGE} />
                <Text style={styles.successSummaryText}>1 dirección</Text>
              </View>
            </View>
            
            {/* Botón cerrar */}
            <TouchableOpacity
              style={styles.successButton}
              onPress={() => {
                setSuccessModalVisible(false);
                navigation.goBack();
              }}
            >
              <Text style={styles.successButtonText}>Continuar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: SEA_COLOR,
  },
  headerTitle: {
    color: 'white',
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
  },
  packageCard: {
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: 'white',
  },
  // Estilos para resumen de múltiples paquetes
  packageSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  packageCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SEA_COLOR,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  packageCountText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  packageSummaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BLACK,
  },
  packageList: {
    gap: 8,
  },
  packageListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: SEA_COLOR,
  },
  packageListItemNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: SEA_COLOR + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  packageListItemNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: SEA_COLOR,
  },
  packageListItemInfo: {
    flex: 1,
  },
  packageListTracking: {
    fontSize: 14,
    fontWeight: '600',
    color: BLACK,
  },
  packageListDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  packageListItemStats: {
    alignItems: 'flex-end',
  },
  packageListStatText: {
    fontSize: 11,
    color: '#888',
  },
  packageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  packageInfo: {
    flex: 1,
  },
  packageTracking: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BLACK,
  },
  packageDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  divider: {
    marginVertical: 12,
  },
  packageStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BLACK,
  },
  costValue: {
    color: SEA_COLOR,
  },
  etaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    padding: 8,
    backgroundColor: SEA_COLOR + '10',
    borderRadius: 8,
    gap: 6,
  },
  etaText: {
    color: SEA_COLOR,
    fontWeight: '600',
  },
  addressCard: {
    margin: 16,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: 'white',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BLACK,
  },
  addAddressButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addAddressText: {
    color: ORANGE,
    fontWeight: '600',
  },
  noAddresses: {
    alignItems: 'center',
    padding: 24,
  },
  noAddressesText: {
    color: '#999',
    marginTop: 8,
    marginBottom: 16,
  },
  addFirstButton: {
    borderRadius: 8,
  },
  addressItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fafafa',
  },
  addressItemSelected: {
    borderColor: SEA_COLOR,
    backgroundColor: SEA_COLOR + '08',
  },
  addressContent: {
    flex: 1,
    marginLeft: 4,
  },
  addressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  addressAlias: {
    fontSize: 15,
    fontWeight: 'bold',
    color: BLACK,
  },
  principalBadge: {
    backgroundColor: SEA_COLOR,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  principalBadgeText: {
    fontSize: 11,
    color: 'white',
    fontWeight: '600',
  },
  defaultChip: {
    backgroundColor: SEA_COLOR + '25',
    height: 22,
    paddingHorizontal: 4,
  },
  defaultChipText: {
    fontSize: 11,
    color: SEA_COLOR,
    fontWeight: '600',
    marginHorizontal: 2,
  },
  addressText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  addressPhone: {
    fontSize: 13,
    color: SEA_COLOR,
    marginTop: 4,
  },
  notesCard: {
    margin: 16,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: 'white',
  },
  notesInput: {
    marginTop: 8,
    backgroundColor: 'white',
  },
  saveButton: {
    margin: 16,
    marginTop: 8,
    borderRadius: 12,
  },
  saveButtonContent: {
    paddingVertical: 8,
  },
  saveButtonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  bottomSpacer: {
    height: 32,
  },
  // Estilos para modal de éxito
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successModal: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    margin: 24,
    width: Dimensions.get('window').width - 48,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  successIconContainer: {
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: BLACK,
    marginBottom: 8,
    textAlign: 'center',
  },
  successMessage: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  successSummary: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    marginBottom: 24,
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    width: '100%',
  },
  successSummaryItem: {
    alignItems: 'center',
    gap: 6,
  },
  successSummaryText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  successButton: {
    backgroundColor: SEA_COLOR,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 12,
    width: '100%',
  },
  successButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
